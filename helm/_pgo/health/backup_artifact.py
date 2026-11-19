"""Inspect and restore the finalized S3 artifacts written by backup-container 2.13.0."""

import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET
import zlib
from dataclasses import dataclass
from datetime import datetime
from threading import Timer
from urllib.parse import quote, urlencode, urlsplit
from zoneinfo import ZoneInfo

DATABASE_TABLES = {"n8n": "workflow_entity", "n8n-custom": "tenant_project_relation"}
DUMP_CLOCK_FORMAT = "%Y-%m-%d_%H-%M-%S"
S3_XML = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
HEADER = re.compile(
    rb"\A(?:\n)?--\n-- PostgreSQL database dump\n--\n\n\\restrict ([a-zA-Z0-9]+)\n"
)
BLOCK = 64 * 1024


class BackupError(Exception):
    """A diagnostic safe to log without logging object keys, SQL or credentials."""


@dataclass(frozen=True)
class Artifact:
    key: str
    source_timestamp: int
    etag: str
    size: int


def source_time(stamp, modified, timezone):
    wall_time = datetime.strptime(stamp, DUMP_CLOCK_FORMAT)
    # Use the older possible instant on the fall-back hour. Uploading an old
    # archive again must not advance its source point-in-time.
    candidates = [
        int(wall_time.replace(tzinfo=timezone, fold=fold).timestamp())
        for fold in (0, 1)
    ]
    valid = [
        epoch
        for epoch in candidates
        if epoch <= modified
        and datetime.fromtimestamp(epoch, timezone).replace(tzinfo=None) == wall_time
    ]
    if not valid:
        raise ValueError("invalid source timestamp")
    return min(valid)


class BackupStore:
    def __init__(self):
        endpoint = urlsplit(os.environ["S3_ENDPOINT"])
        bucket, _, prefix = os.environ["S3_BUCKET"].partition("/")
        if (
            endpoint.scheme != "https"
            or not endpoint.hostname
            or not bucket
            or not prefix.strip("/")
        ):
            raise BackupError(
                "expected an HTTPS endpoint and a bucket with an object prefix"
            )
        self.url = endpoint.geturl().rstrip("/") + "/" + quote(bucket, safe="")
        self.prefix = (
            prefix.strip("/")
            + "/"
            + os.environ.get("BACKUP_SOURCE_HOST", "chwf-pgo-replicas")
        )
        self.timezone = ZoneInfo(os.environ.get("BACKUP_TIME_ZONE", "PST8PDT"))

    def _request(self, path, timeout, *args):
        try:
            return subprocess.run(
                [
                    "curl",
                    "-q",
                    "--fail",
                    "--silent",
                    "--connect-timeout",
                    "5",
                    "--max-time",
                    str(timeout),
                    "--aws-sigv4",
                    "aws:amz:us-east-1:s3",
                    "--user",
                    os.environ["S3_USER"] + ":" + os.environ["S3_PASSWORD"],
                    *args,
                    self.url + path,
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=timeout + 1,
            ).stdout
        except (subprocess.SubprocessError, OSError) as exc:
            raise BackupError("S3 request failed") from exc

    def latest(self, database, *, since=0):
        prefix = f"{self.prefix}-{database}_"
        exact = re.compile(
            re.escape(prefix) + r"(\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d)\.sql\.gz"
        )
        params = {"list-type": "2", "prefix": prefix}
        if since:
            # Allow for the clock going back one hour; selection is by parsed
            # source time rather than key order or S3 LastModified.
            after = datetime.fromtimestamp(
                max(0, since - 7200), self.timezone
            ).strftime(DUMP_CLOCK_FORMAT)
            params["start-after"] = prefix + after
        latest = None
        tokens = set()
        while True:
            page = ET.fromstring(self._request("?" + urlencode(params), 12))
            if page.tag != "{" + S3_XML["s3"] + "}ListBucketResult":
                raise BackupError("unexpected S3 listing response")
            for entry in page.findall("s3:Contents", S3_XML):
                key = entry.findtext("s3:Key", "", S3_XML)
                match = exact.fullmatch(key)
                size = int(entry.findtext("s3:Size", "0", S3_XML))
                etag = entry.findtext("s3:ETag", "", S3_XML)
                if (
                    not match
                    or not size > 0
                    or not re.fullmatch(r'"[a-fA-F0-9]+(?:-[0-9]+)?"', etag)
                ):
                    continue
                modified = datetime.fromisoformat(
                    entry.findtext("s3:LastModified", "", S3_XML)
                ).timestamp()
                source = source_time(
                    match[1], min(time.time(), modified), self.timezone
                )
                if source > since and (
                    latest is None or source > latest.source_timestamp
                ):
                    latest = Artifact(key, source, etag, size)
            truncated = page.findtext("s3:IsTruncated", "", S3_XML)
            if truncated == "false":
                return latest
            token = page.findtext("s3:NextContinuationToken", "", S3_XML)
            if truncated != "true" or not token or token in tokens:
                raise BackupError("incomplete S3 listing")
            tokens.add(token)
            params.pop("start-after", None)
            params["continuation-token"] = token

    def download(self, artifact, path):
        self._request(
            "/" + quote(artifact.key, safe="/"),
            120,
            "--header",
            "If-Match: " + artifact.etag,
            "--output",
            str(path),
        )
        if path.stat().st_size != artifact.size:
            raise BackupError("downloaded artifact size did not match S3")


def dump_chunks(path):
    # The first gzip member is pg_dump; subsequent members are cluster roles.
    # Don't replay the roles: PGO owns those on DR. Validate the whole archive
    # including CRCs, then require the first member's pg_dump footer so that a
    # partial pg_dump (even if gzip itself succeeded) cannot pass verification.
    try:
        subprocess.run(
            ["gzip", "-t", str(path)],
            check=True,
            timeout=120,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.SubprocessError as exc:
        raise BackupError("invalid gzip archive") from exc
    with path.open("rb") as archive:
        decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
        tail = b""
        marker = None
        pending = b""
        while not decoder.eof:
            pending = decoder.unconsumed_tail or archive.read(BLOCK)
            if not pending:
                raise BackupError("incomplete gzip member")
            chunk = decoder.decompress(pending, BLOCK)
            if marker is None:
                tail += chunk
                if len(tail) < 160 and not decoder.eof:
                    continue
                match = HEADER.match(tail)
                if not match:
                    raise BackupError("unrecognized pg_dump header")
                marker = match[1]
                chunk, tail = tail, b""
            tail = (tail + chunk)[-1024:]
            yield chunk
        footer = b"\n-- PostgreSQL database dump complete\n--\n\n\\unrestrict " + (
            marker or b""
        )
        if not tail.rstrip().endswith(footer):
            raise BackupError("pg_dump did not finish")


def replay(path, database, target, *, before_commit=lambda: True):
    # These database/schema/table names are the application contract, not
    # identifiers supplied by the dump or remote object metadata.
    relation = "public." + DATABASE_TABLES[database]
    prepare = b"""BEGIN;
SET LOCAL lock_timeout = '10s';
DROP SCHEMA IF EXISTS drizzle CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public AUTHORIZATION pg_database_owner;
GRANT USAGE ON SCHEMA public TO PUBLIC;
COMMENT ON SCHEMA public IS 'standard public schema';
"""
    verify = f"\nDO $$ BEGIN PERFORM 1 FROM {relation} LIMIT 1; END $$;\n".encode()
    chunks = dump_chunks(path)
    first = next(chunks)  # validate the archive before taking database locks
    with subprocess.Popen(
        ["psql", "-X", "-w", "-q", "-v", "ON_ERROR_STOP=1", "-d", database],
        env=target,
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    ) as sql:
        timer = Timer(240, sql.kill)
        timer.start()
        try:
            sql.stdin.write(prepare)
            sql.stdin.write(first)
            for chunk in chunks:
                sql.stdin.write(chunk)
            if not before_commit():
                return False  # closing the connection rolls back the open transaction
            sql.stdin.write(verify + b"COMMIT;\n")
            sql.stdin.close()
            if sql.wait() != 0:
                raise BackupError(
                    "strict PostgreSQL restore or table verification failed"
                )
            return True
        except BrokenPipeError as exc:
            raise BackupError(
                "PostgreSQL stopped before verification completed"
            ) from exc
        finally:
            timer.cancel()
            chunks.close()
            if sql.poll() is None:
                sql.kill()
