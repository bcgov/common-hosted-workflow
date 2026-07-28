---
title: Redis
sidebar_label: Redis
sidebar_position: 6
---

# Redis

Redis is a core runtime dependency in this repository.

It is used for more than simple caching. In this platform, Redis supports both n8n execution behavior and UI authentication/session workflows.

## Why This Project Uses Redis

The repository relies on Redis for two distinct roles:

- queue backing for n8n queue-mode execution
- session and state storage for UI OIDC flows in `external-hooks`

This makes Redis part of both the workflow execution plane and the authentication support plane.

## How This Repository Uses It

In deployed environments, Helm configures n8n to use Redis through queue-related environment variables such as:

- `QUEUE_BULL_REDIS_HOST`
- `QUEUE_BULL_REDIS_PORT`

Separately, `external-hooks` uses Redis as the store for UI OIDC state, tokens, tenant roles, and tenant groups.

## Local Versus Deployed Model

- local development runs a simple Redis container through Docker Compose
- deployed environments use the Redis Helm dependency enabled from the main chart

## Architectural Importance

Without Redis:

- n8n queue-mode execution would not function as designed
- UI OIDC state handling and session-related caching would break

So Redis is not optional plumbing. It is part of the core runtime contract.

## Key Source Files

- `docker-compose/docker-compose.yml`
- `helm/main/values.yaml`
- `external-hooks/src/config.ts`
- `external-hooks/src/api/helpers/ui-oidc-store.ts`
