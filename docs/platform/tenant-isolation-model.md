---
title: Tenant Isolation Model
sidebar_label: Tenant Isolation
sidebar_position: 7
---

# Tenant isolation model

This document defines the tenant isolation model for CHWF once the enterprise license features are available for normal use.

It is intentionally grounded in the current deployment and code structure in this repository rather than an abstract target state.

## Decision summary

CHWF should use **logical tenant isolation on a shared platform instance**.

That means:

- one shared CHWF deployment per environment
- one shared `n8n` runtime and worker pool per environment
- one shared PostgreSQL database and schema per environment
- tenant separation enforced by `n8n` project boundaries, tenant-to-project mapping, request scoping, and authorization checks

This is the best fit for the current Helm/OpenShift deployment model. It does **not** provide hard infrastructure isolation between tenants.

## Tenant boundary

The tenant boundary is defined at the application and data-access layer, not at the infrastructure layer.

| Isolation option                       | CHWF position | Notes                                                                                         |
| -------------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| separate instance per tenant           | not selected  | would require a different deployment and operating model than the current shared Helm release |
| separate schema per tenant             | not selected  | would add database operational complexity and is not reflected in the current storage model   |
| logical isolation in a shared instance | selected      | aligns with current `n8n` team project model, shared runtime, and shared database             |

In practice, the primary tenant boundary is:

- one CSTAR tenant maps to one `n8n` team project
- one `n8n` team project maps to at most one tenant
- tenant-aware APIs require an explicit tenant context
- tenant-scoped records are read and written only through project IDs resolved from that tenant context

Important exception:

- personal projects also receive a generated tenant-like ID for internal consistency
- that ID is a CHWF pseudo-tenant, not a CSTAR tenant

## Why this model fits the deployment model

The current deployment model is a shared application release per environment.

From the existing platform docs:

- Helm deploys a single `chwf` release per namespace/environment
- `n8n` runs as shared `main`, `worker`, `webhook`, and `runner` deployments
- PostgreSQL and Redis are shared runtime dependencies for that release

Because the platform is already deployed as a shared service, the isolation model must be enforced in the application runtime, authorization layer, and storage access patterns.

## `tenant_id` usage across layers

`tenant_id` is not used identically in every layer. The meaning must stay explicit.

| Layer                    | Representation                                      | Purpose                                                                            |
| ------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| identity source          | CSTAR tenant UUID                                   | authoritative tenant identity for team tenants                                     |
| session/UI               | `tenantRoles[].tenantId`, `tenantGroups[].tenantId` | carries tenant-scoped roles and groups for the logged-in user                      |
| request transport        | `X-TENANT-ID` header                                | forces the caller to choose the tenant context explicitly                          |
| mapping layer            | `tenant_project_relation.tenant_id`                 | links a tenant ID to the owning `n8n` project                                      |
| workflow engine          | resolved `projectId`                                | native `n8n` ownership boundary for workflows, credentials, and project membership |
| WIL storage              | `project_id` on tenant-scoped records               | stores the resolved project boundary rather than duplicating tenant ID on each row |
| personal project support | generated UUID tenant ID                            | pseudo-tenant for a user's personal project only                                   |

### Interpretation rules

- For CSTAR-backed team projects, `tenant_id` means the real CSTAR tenant UUID.
- For personal projects, `tenant_id` is locally generated and must never be treated as a CSTAR tenant.
- Once a tenant is resolved to a project, most downstream storage access should use `projectId` as the enforcement key.

## Isolation enforcement points

Isolation is not enforced in one place. It is a layered control set.

### 1. Identity and tenant membership

Tenant membership originates outside CHWF in CSTAR.

Current enforcement points:

- OIDC establishes the user identity
- CSTAR provides tenant membership and shared-service roles
- tenant-project sync creates or updates managed project relations based on CSTAR roles
- stale managed project relations are removed when the user no longer belongs to a tenant

Security significance:

- users do not gain tenant project access only by having a global `n8n` role
- tenant access must also exist in CSTAR and then be reflected into the mapped `n8n` team project

### 2. API layer

Tenant-aware APIs must require explicit tenant scope.

Current enforcement points:

- `X-TENANT-ID` is required for workflow interaction APIs
- tenant IDs are validated as UUIDs
- tenant IDs are resolved through `tenant_project_relation`
- for workflow interaction custom APIs, the resolved tenant project set is intersected with the caller's accessible `n8n` projects
- internal POST create routes also require `Authorization: Bearer <INTERNAL_AUTH_TOKEN>`

Security significance:

- callers cannot access tenant data by API key alone
- tenant context and project membership both have to line up

### 3. Workflow engine and project ownership

`n8n` project ownership is the native isolation primitive used inside the workflow platform.

Current enforcement points:

- workflows and credentials are associated to projects
- workflow interaction APIs validate that executions belong to the expected workflow
- workflow and execution lookups are restricted to the caller's allowed project IDs
- UI WIL routes resolve actor matchers from tenant-scoped roles and groups in session

Security significance:

- even when the same runtime processes multiple tenants, access should still collapse down to project-scoped queries and checks

### 4. Storage layer

PostgreSQL uses shared tables, so storage isolation is logical rather than physical.

Current enforcement points:

- `tenant_project_relation` provides a 1:1 tenant-to-project mapping model
- `tenant_project_relation.project_id` is unique, which prevents one project from being shared across multiple tenants
- tenant-scoped WIL records reference `project_id`
- list and mutation operations are expected to filter by allowed project IDs

Security significance:

- storage isolation depends on application query discipline
- a bug in project scoping can become a cross-tenant data exposure

### 5. Session and cache layer

Redis stores derived tenant context for UI/API use.

Current enforcement points:

- tenant roles and groups are cached per authenticated user
- cache is refreshed or repopulated through session flows
- tenant roles and groups are consumed per tenant, not as global permissions

Security significance:

- cached tenant data is derived state and must remain tied to the authenticated user session
- stale cache can temporarily delay revocation until refresh or expiry, so cache lifecycle matters

## Cross-tenant access prevention strategy

The prevention strategy for CHWF should be:

1. Require explicit tenant selection on every tenant-aware API via `X-TENANT-ID`.
2. Resolve that tenant to one and only one project boundary through `tenant_project_relation`.
3. Intersect tenant-mapped projects with the caller's accessible `n8n` projects before reading or mutating tenant data.
4. Apply tenant-scoped actor and role matching using session data for WIL features.
5. Validate workflow and execution ownership against the resolved project scope before creating or returning tenant-scoped records.
6. Keep global roles separate from tenant roles so platform admin permissions do not imply tenant data access by default.
7. Restrict tenant-to-project mapping changes to admin-only surfaces.
8. Treat personal project tenant IDs as pseudo-tenants and never mix them with CSTAR-backed tenants in authorization decisions.

## Risks and trade-offs

This model is practical and aligned with the current platform, but it has real trade-offs.

| Area                          | Benefit                                                           | Risk / trade-off                                                                         |
| ----------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| shared runtime                | cheaper and simpler operations                                    | no hard runtime isolation; noisy-neighbor and code-path bugs can affect multiple tenants |
| shared database/schema        | simpler backup, restore, and deployment model                     | no hard data-plane boundary; isolation depends on correct application logic              |
| `n8n` project-based isolation | aligns with enterprise/team features already used by the platform | project ownership must stay consistent for every workflow, credential, and custom record |
| CSTAR-driven sync             | central source of truth for tenant membership                     | revocation is not fully instantaneous because sync and cache refresh are asynchronous    |
| personal pseudo-tenants       | lets personal projects participate in tenant-aware flows          | easy to confuse with real CSTAR tenants if not documented carefully                      |
| admin-managed mappings        | allows repair and bootstrap operations                            | manual mistakes can mis-map a tenant to the wrong project                                |

## Known gaps and required controls

The current codebase already highlights one important gap.

- The helper used by UI WIL routes resolves `X-TENANT-ID` to project IDs, but it still contains a `TODO` for direct CSTAR tenant access verification.
- That means part of the current protection model relies on project mapping and tenant-scoped session roles rather than a second live tenant-membership confirmation at that point.

Required controls before calling the model fully validated:

- complete the direct tenant access verification path where it is still missing
- add automated tests for cross-tenant negative cases on both custom APIs and UI WIL routes
- confirm that every tenant-scoped table access path filters by resolved project scope
- add audit logging for tenant-to-project mapping changes and other privileged tenant-boundary operations
- review cache invalidation and token refresh behavior for membership revocation timing

## Validation checklist

The following checks should be used to validate the model after enterprise-license-backed tenant features are active.

| Check                                                        | Expected result                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| user belongs to tenant A only                                | user sees only tenant A team project and tenant A WIL data                           |
| user belongs to tenant A and tenant B                        | user sees separate tenant-scoped data according to the selected `X-TENANT-ID`        |
| caller sends valid API key with wrong `X-TENANT-ID`          | request fails because tenant mapping and caller project access do not intersect      |
| caller sends `workflowInstanceId` outside tenant scope       | request fails with scoped validation error                                           |
| user loses CSTAR access to a tenant                          | managed project relation is removed on next sync and tenant-scoped access disappears |
| personal project tenant ID used as if it were a CSTAR tenant | flow is rejected or explicitly handled as a personal pseudo-tenant only              |
| admin attempts conflicting tenant-project mapping            | operation fails with conflict                                                        |

## Recommended security position

For the current architecture, the recommended position is:

- accept **shared-instance logical isolation** as the primary tenant model
- do not claim hard tenant isolation at the runtime, node, or database-schema level
- treat tenant boundary defects as high-severity security issues because a single bug can cross tenant lines in a shared platform

If a future requirement demands stronger isolation, the next step would be a deployment-model change such as per-tenant instances or a materially different data architecture. That is outside the scope of the current CHWF platform design.

## Review status

This document should be reviewed with security stakeholders before the model is treated as fully signed off.

Suggested reviewers:

- platform technical architect
- security architecture / security operations stakeholders
- platform application owners for `n8n`, `external-hooks`, and external UI

Current status:

- document created
- architecture position defined
- risks and trade-offs documented
- security stakeholder review pending

## Related docs

- [High-Level Architecture](./high-level-architecture.md)
- [Authentication And Authorization](./authentication-and-authorization.md)
- [Personal Project Tenant Mapping](./personal-project-tenant-mapping.md)
- [Tenant Project Sync](../external-ui/tenant-project-sync.md)
- [Workflow interaction layer - headers and n8n validations](../external-hooks/workflow-interaction-api-validations.md)
