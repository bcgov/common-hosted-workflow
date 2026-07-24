---
title: Database Backup Process
sidebar_label: Database Backups
sidebar_position: 4
---

# Database Backup Process

There was not a dedicated database backup document before. Backup behavior was only implied across Helm values, the local PGO chart, and the ISA.

This page documents the current implementation.

## Backup Architecture

The platform uses **two complementary backup mechanisms** for PostgreSQL on Gold:

| Mechanism        | Purpose                                                             | Where configured                          |
| ---------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| `pgBackRest`     | Physical PostgreSQL backup and recovery managed through Crunchy PGO | `helm/_pgo` and `helm/main/values-*.yaml` |
| `backup-storage` | Logical `pg_dump` style backups exported to object storage          | `helm/main/values-*.yaml`                 |

These serve different goals:

- `pgBackRest` supports platform-grade database protection and cluster recovery.
- `backup-storage` produces database export artifacts used by the DR restore workflow described in the ISA and Helm overlays.

## Physical Backups With pgBackRest

The local PGO chart maps `pgo.pgBackRest` values into the Crunchy `PostgresCluster` backup specification.

The design supports multiple repositories:

- `repo1`: local PVC-backed backup repository inside the cluster
- `repo2`: S3-backed backup repository in object storage

Typical Gold overlays use:

- short-retention local backups in `repo1`
- longer-retention object-storage backups in `repo2`

For the `b0c13b` overlays, `repo2` points to `commonservices.objectstore.gov.bc.ca` with environment-specific buckets such as:

- `workflow-dev`
- `workflow-test`
- `workflow-prod`

## Logical Backups With backup-storage

The main chart also supports a separate `backup-storage` component.

In current `b0c13b` Gold overlays it is enabled and configured to back up:

- `n8n`
- `n8n-custom`

The configured source is the read replica service:

```text
chwf-pgo-replicas:5432
```

This reduces backup load on the primary database service.

The output is written to environment-specific S3 prefixes such as:

- `workflow-dev/backups/pgdump/`
- `workflow-test/backups/pgdump/`
- `workflow-prod/backups/pgdump/`

## Scheduling Model

Backup schedules are environment-specific and encoded in Helm overlays rather than in a single central schedule table.

Representative examples from current Gold overlays:

| Environment overlay            | pgBackRest full | pgBackRest incremental | logical backup                                        |
| ------------------------------ | --------------- | ---------------------- | ----------------------------------------------------- |
| `values-b0c13b-dev-gold.yaml`  | `0 7 * * 1-5`   | `0 9-17/2 * * 1-5`     | every 10 min, plus full verification at `0 7 * * 1-5` |
| `values-b0c13b-test-gold.yaml` | `0 3 * * 1-5`   | `30 22 * * 1-5`        | every 10 min, plus full verification at `0 3 * * 1-5` |
| `values-b0c13b-prod-gold.yaml` | `0 2 * * *`     | `0 */4 * * *`          | every 10 min, plus full verification at `0 2 * * *`   |
| `values-c89a45-dev-gold.yaml`  | `0 8 * * *`     | `0 0,4,12,16,20 * * *` | not currently enabled in this overlay                 |

This means backup policy is part of environment design, not just a platform default.

## Gold Versus GoldDR

Backups are created on **Gold**. GoldDR is primarily a restore target.

Current DR overlays show this explicitly:

- `backup-storage.enabled: false` on `golddr`
- trigger restrictions on DR remain in place
- selected DR overlays enable `pgo.conditionalRestore`

This aligns with the ISA:

- Gold is the source of truth
- GoldDR is refreshed from Gold backups
- DR-only writes are not carried back to Gold

## How DR Restore Works

The local PGO chart includes a `conditionalRestore` CronJob intended for GoldDR.

Its operating model is:

1. query `dns-probe` to understand current routing posture
2. if GoldDR is acting as the active site, skip restore
3. if Gold routing is not yet stable, skip restore
4. if GoldDR is in standby mode, check S3 for newer logical backup files
5. restore each database only when a newer backup artifact is found
6. record the last restored backup key in a ConfigMap to avoid unnecessary repeated restores

This is a controlled standby-refresh process, not bidirectional replication.

## Operational Boundaries

At an architect level, the important boundary is this:

- `pgBackRest` protects the PostgreSQL cluster itself
- `backup-storage` provides logical exports used by the DR restore workflow
- failover continuity is achieved through warm standby plus GSLB routing, not active-active database synchronization

That is why the service can support Gold-tier failover for safe workflows while still treating Gold as authoritative.

## Where To Look In Code

Primary sources for the current implementation:

- `helm/_pgo/values.yaml`
- `helm/_pgo/templates/postgres-cluster.yaml`
- `helm/_pgo/templates/conditional-restore/cronjob.yaml`
- `helm/_pgo/templates/conditional-restore/script.yaml`
- `helm/main/values-b0c13b-dev-gold.yaml`
- `helm/main/values-b0c13b-test-gold.yaml`
- `helm/main/values-b0c13b-prod-gold.yaml`
- `helm/main/values-c89a45-dev-gold.yaml`
- `docs/platform/internal-service-agreement.md`
