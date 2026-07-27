---
title: Keycloak And OIDC
sidebar_label: Keycloak & OIDC
sidebar_position: 7
---

# Keycloak And OIDC

OIDC-based authentication is a first-class part of this platform, and Keycloak is used as the local development identity provider.

In deployed environments, the runtime integrates with BC Gov login infrastructure through environment-specific OIDC issuer settings.

## Why This Project Uses OIDC

The platform is multi-tenant and role-aware, so it needs a standards-based authentication model that can support:

- interactive login
- token validation
- user identity resolution
- role-aware session handling
- environment-specific issuers and redirect URLs

OIDC provides that model.

## Why Keycloak Appears In This Repo

Keycloak is used primarily in local development so the full login flow can be exercised without depending on external identity infrastructure.

Docker Compose includes:

- a Keycloak container
- Keycloak provisioning steps
- OIDC client configuration wired into the local n8n runtime

## How The Deployed Runtime Uses OIDC

In deployed environments, the Helm overlays set issuer URLs and related configuration for dev, test, and prod login infrastructure.

The `external-hooks` layer centralizes OIDC configuration and handles:

- provider discovery and callback logic
- UI login redirect flows
- token and session processing
- role-aware user context assembly

## Relationship To Redis

UI OIDC state and related session data are stored in Redis, which is why authentication and Redis are closely coupled in this platform.

## Architectural Importance

Authentication is not bolted on at the edge. It is embedded into the runtime through:

- n8n environment configuration
- external hooks and UI routes
- role and tenant-aware session handling

That makes OIDC part of the platform's core technology stack rather than just an integration detail.

## Key Source Files

- `docker-compose/docker-compose.yml`
- `external-hooks/src/config.ts`
- `external-hooks/src/api/routes/oidc.ts`
- `external-hooks/src/api/helpers/oidc-provider.ts`
- `docs/external-hooks/oidc.md`
