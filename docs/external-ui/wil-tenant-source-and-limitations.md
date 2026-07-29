---
title: WIL Tenant Source And Limitations
sidebar_label: WIL Tenant Source
sidebar_position: 3
---

# WIL tenant source and limitations

This document explains where WIL gets tenant information today and what the remaining limitations are.

## Short version

WIL currently uses two related but different tenant-resolution patterns:

- `GET /ui-api/wil/tenants` uses `TenantService.listTenantsForUser()`, which combines CSTAR tenants with the user's personal project pseudo-tenant.
- tenant scoping for WIL data routes uses `X-TENANT-ID` plus `tenant_project_relation` to resolve project IDs.

The second part still has an important limitation: it does not independently verify tenant membership against CSTAR inside `resolveWilTenantProjectIds()`.

## Current sources

### 1. Tenant list endpoint

`GET /ui-api/wil/tenants` currently:

- reads CSTAR tenants using the user's OIDC access token when available
- adds the user's personal project as a pseudo-tenant when present
- falls back to personal-project-only behavior if CSTAR is unavailable

This is better than the older placeholder description that implied the endpoint only read from `tenant_project_relation`.

## 2. Tenant scoping for WIL actions, messages, callbacks, and related routes

Most WIL routes call `resolveWilTenantProjectIds()`.

That helper currently:

1. reads `X-TENANT-ID`
2. validates it is a UUID
3. loads project IDs from `tenant_project_relation`
4. rejects the request if no project is linked to that tenant

Current limitation:

- the helper still contains a TODO for direct CSTAR-based tenant access verification

In other words, the helper trusts the tenant-to-project mapping table and does not itself confirm that the current user belongs to the requested CSTAR tenant.

## Why this still mostly works

WIL also applies actor matching and project scoping after tenant resolution.

That means the request still has to line up with:

- a mapped project ID
- the current user's actor matchers for the selected tenant
- the action or message existing in scope

So the limitation is not "no authorization at all". The limitation is that tenant identity resolution is not fully CSTAR-verified at the helper boundary.

## Personal-project nuance

The tenant list can include the user's personal project as a pseudo-tenant.

That means not every tenant ID surfaced in WIL UI behavior represents a real CSTAR tenant. Some are CHWF-local tenant mappings for personal projects.

## Known limitations

| Limitation                                                                       | Impact                                                                 |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `resolveWilTenantProjectIds()` does not directly call CSTAR to verify membership | tenant header validation depends on local mapping state                |
| personal pseudo-tenants share the same tenant-mapping model                      | not every tenant ID in UI flows is a CSTAR tenant                      |
| older docs still describe more placeholder behavior                              | documentation can look inconsistent unless read alongside current code |

## Documentation note

Some older WIL docs still describe the tenant list source more narrowly than the current implementation. The code now uses `TenantService.listTenantsForUser()` for `GET /ui-api/wil/tenants`, while route-level tenant scoping still relies on `tenant_project_relation` lookup plus a TODO for stronger CSTAR verification.

## Related docs

- `docs/external-ui/WIL/backend-api.md`
- `docs/external-ui/WIL/architecture.md`
- `docs/external-ui/WIL/future-work.md`
- `docs/platform/personal-project-tenant-mapping.md`
- `docs/platform/authentication-and-authorization.md`
