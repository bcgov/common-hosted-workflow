---
title: PostgreSQL And PGO
sidebar_label: PostgreSQL & PGO
sidebar_position: 5
---

# PostgreSQL And PGO

PostgreSQL is the primary persistent data store for this platform, and Crunchy PGO is the operator model used to run it on OpenShift.

## Why This Project Uses PostgreSQL

The platform needs durable storage for:

- workflows and workflow metadata
- credentials and project-scoped resources
- execution history and related runtime state
- custom application data stored outside n8n's default tables

PostgreSQL provides the transactional persistence layer for that model.

## Why This Project Uses PGO

The repository uses Crunchy PGO because the service needs more than a single standalone database container.

PGO provides the operator-based control plane for:

- PostgreSQL cluster lifecycle
- replica topology
- backup orchestration through pgBackRest
- connection mediation through pgbouncer-related outputs
- restore and DR support patterns

## How This Repository Uses It

The local PGO chart under `helm/_pgo` renders a `PostgresCluster` custom resource and related backup and restore resources.

The main chart enables that subchart and wires n8n to credentials and endpoints produced by the cluster.

The repo also provisions:

- multiple database users
- HA-oriented instance defaults
- pgBackRest repositories
- DR-oriented conditional restore logic in selected overlays

## Relationship To Other Docs

This page describes the core technology role.

For backup and restore design, see [Database Backup Process](../platform/database-backup-process.md).

## Local Versus Deployed Model

- local development uses a simple PostgreSQL container in Docker Compose
- deployed environments use operator-managed PostgreSQL through Crunchy PGO

That split keeps local setup straightforward while preserving a stronger production operating model.

## Key Source Files

- `docker-compose/docker-compose.yml`
- `helm/_pgo/values.yaml`
- `helm/_pgo/templates/postgres-cluster.yaml`
- `helm/main/values.yaml`
- `docs/platform/database-backup-process.md`
