---
title: n8n
sidebar_label: n8n
sidebar_position: 4
---

# n8n

n8n is the primary workflow runtime in this repository.

This project does not use stock n8n as-is. It builds a customized n8n image and extends it with custom community nodes, external hooks, and an external UI.

## Why This Project Uses n8n

n8n provides the workflow execution engine for the Common Hosted Workflow platform.

It is used because it offers:

- workflow orchestration as the core product capability
- extensibility through custom nodes and hooks
- compatibility with PostgreSQL and Redis-backed scaling patterns
- a runtime model that can be adapted for enterprise authentication and shared-platform governance

## How This Repository Extends n8n

The custom image builds and packages:

- local `community-nodes`
- `external-hooks`
- `external-ui`

The runtime also enables:

- custom non-UI routes
- external frontend hook assets
- OIDC-based sign-in support
- tenant and role-aware access controls

## Runtime Topology

In OpenShift, n8n is deployed as multiple components rather than a single container:

- `main`
- `worker`
- `webhook`
- `runner`

This reflects the repo's queue-mode and external-runner design.

## Data Dependencies

n8n in this platform depends on:

- PostgreSQL for persistent workflow and execution data
- Redis for queue execution and UI OIDC session/state storage

That makes n8n the application runtime, but not the only critical technology in the stack.

## Security And Platform Constraints

The Helm values show several platform controls around n8n, including:

- queue mode enabled by default
- selected modules disabled
- binary data and filesystem restrictions
- trigger nodes excluded on DR
- environment-driven OIDC configuration

This means the repo operates n8n as a governed platform runtime, not as an unconstrained automation sandbox.

## Local And Deployed Modes

Local development uses Docker Compose with PostgreSQL, Redis, and Keycloak.

Deployed environments use the custom image plus the Helm-driven multi-process topology on OpenShift.

## Key Source Files

- `Dockerfile`
- `docker-compose/docker-compose.yml`
- `helm/_n8n/values.yaml`
- `helm/_n8n/templates/deployments/main.yaml`
- `helm/main/values.yaml`
