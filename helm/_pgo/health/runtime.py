"""Small HTTP and Kubernetes clients for the health probes and backup jobs."""

import json
import os
import ssl
from pathlib import Path
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def read_json(url, *, headers=None, body=None, method=None, opener=None, timeout=8):
    request = Request(url, data=body, headers=headers or {}, method=method)
    with (opener or build_opener(NoRedirect())).open(
        request, timeout=timeout
    ) as response:
        if response.status != 200:
            raise ValueError("unexpected HTTP response status")
        payload = response.read(1024 * 1024 + 1)
        if len(payload) > 1024 * 1024:
            raise ValueError("unexpected HTTP response size")
        return json.loads(payload)


def kube(path, data=None):
    from urllib.request import HTTPSHandler, ProxyHandler

    account = Path("/var/run/secrets/kubernetes.io/serviceaccount")
    namespace = quote(os.environ["NAMESPACE"], safe="")
    tls = ssl.create_default_context(cafile=str(account / "ca.crt"))
    headers = {"Authorization": "Bearer " + (account / "token").read_text().strip()}
    if data is not None:
        headers["Content-Type"] = "application/merge-patch+json"
    return read_json(
        "https://kubernetes.default.svc" + path.format(namespace=namespace),
        headers=headers,
        body=None if data is None else json.dumps(data).encode(),
        method="GET" if data is None else "PATCH",
        opener=build_opener(ProxyHandler({}), HTTPSHandler(context=tls), NoRedirect()),
    )


def configmap(name, updates=None):
    path = "/api/v1/namespaces/{namespace}/configmaps/" + quote(name, safe="")
    return kube(path, None if updates is None else {"data": updates}).get("data", {})


def timestamp(data, key):
    value = data.get(key, "")
    return int(value) if value.isascii() and value.isdecimal() else 0


def restore_eligible():
    # The in-cluster dns-probe is also the failover controller's routing source.
    status = read_json(os.environ["DNS_PROBE_STATUS_URL"])
    routing, duration = status["current_routing"], status["duration_seconds"]
    if (
        routing not in ("primary", "secondary")
        or type(duration) is not int
        or duration < 0
    ):
        raise ValueError("untrusted DNS routing status")
    return routing == "primary" and duration >= int(os.environ["STABILIZATION_SECONDS"])
