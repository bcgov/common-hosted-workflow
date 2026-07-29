---
title: Authentication And Authorization
sidebar_label: AuthN & AuthZ
sidebar_position: 3
---

# Authentication and authorization

This document explains how access works across:

- `n8n` sign-in
- custom API endpoints exposed by `external-hooks`
- global roles
- tenant and project-level roles derived from CSTAR
- initial access requests for users who do not yet have a global role

It is a consolidation document. It does not replace the more detailed docs for OIDC, tenant-project sync, or workflow interaction APIs.

## Short version

| Concern                           | Source of truth                                                                              | What it controls                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Authentication to `n8n` UI        | OIDC / Keycloak                                                                              | Who can sign in to the platform                                                         |
| Global `n8n` role                 | OIDC role claim, CSTAR managed project-role fallback, or access-request approval via CSS SSO | Whether the user is an owner, admin, or member in the platform                          |
| CSTAR tenant membership           | CSTAR                                                                                        | Which tenant team projects the user should be in                                        |
| CSTAR tenant shared-service roles | CSTAR                                                                                        | Whether the user becomes `project:editor`, `project:viewer`, or no managed project role |
| Custom admin API auth             | `X-N8N-API-KEY` for `global:owner` or `global:admin`                                         | Access to admin-only custom endpoints                                                   |
| Workflow interaction API auth     | `X-N8N-API-KEY`, `X-TENANT-ID`, and sometimes internal bearer token                          | Tenant-scoped access to messages and actions                                            |

## 1. Authentication

### 1.1 `n8n` sign-in

`n8n` authenticates users through the custom OIDC hook.

High-level flow:

1. User opens `GET /rest/auth/oidc/login`.
2. The app redirects the browser to the OIDC provider.
3. The provider returns to `GET /rest/auth/oidc/callback`.
4. The callback resolves the user's identity and role claim.
5. The app creates or updates the `n8n` user.
6. The app issues the `n8n-auth` cookie for the browser session.

Important details:

- The first user ever created becomes `global:owner`.
- Later users normally become the mapped OIDC role.
- If `SSO_RESTRICT_NO_ROLE=false`, a user with no valid upstream role falls back to `global:member`.
- If `SSO_RESTRICT_NO_ROLE=true` and the user has any CSTAR managed project role in any tenant, the user also falls back to `global:member`.
- If `SSO_RESTRICT_NO_ROLE=true` and the user has no valid upstream role and no CSTAR managed project role, the user is redirected into the access-request flow.
- If CSTAR verification fails during that fallback check, sign-in fails instead of silently routing the user to access request.

This is the authentication path for the `n8n` web app itself.

### 1.2 Custom API endpoint authentication

There are two main custom API surfaces.

| API surface                                         | Authentication                                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Admin custom APIs under `/rest/custom/admin/*`      | `X-N8N-API-KEY`                                                                                                   |
| Workflow interaction APIs under `/rest/custom/v1/*` | `X-N8N-API-KEY`, `X-TENANT-ID`, and `Authorization: Bearer <INTERNAL_AUTH_TOKEN>` for internal POST create routes |

Admin custom APIs:

- Authenticate with `X-N8N-API-KEY`.
- The API key must belong to an `n8n` user.
- The caller must be `global:owner` or `global:admin`.

Workflow interaction APIs:

- Authenticate the caller with `X-N8N-API-KEY`.
- Require `X-TENANT-ID` so the request can be scoped to a tenant/project mapping.
- For internal create routes, also require `Authorization: Bearer <INTERNAL_AUTH_TOKEN>`.
- The API key user must have access to the mapped `n8n` project, or the request is rejected.

## 2. Authorization model

### 2.1 Global roles

Global roles are platform-wide `n8n` roles:

- `global:owner`
- `global:admin`
- `global:member`

These are not tenant-scoped.

These roles come from the upstream OIDC role claim, from the CSTAR managed project-role fallback in the login callback, or from the access-request approval flow.

What they are used for:

- `global:owner` and `global:admin` can use admin-only APIs and review access requests.
- `global:member` is the normal baseline platform user role.
- A user with no valid upstream global role may still become `global:member` if CSTAR shows any managed tenant project role; otherwise the user may be disabled or routed to access request, depending on configuration.

### 2.2 Project-level roles

In this platform, a tenant is implemented as an `n8n` team project.

Managed project roles are:

- `project:editor`
- `project:viewer`

There is also `project:admin`, but tenant-project sync does not assign it to normal tenant users. It is reserved for the global owner on tenant project creation.

Current CSTAR-to-`n8n` role mapping:

| CSTAR shared-service role | `n8n` project role      |
| ------------------------- | ----------------------- |
| `project:editor`          | `project:editor`        |
| `project:viewer`          | `project:viewer`        |
| Any other CSTAR role      | No managed project role |

If both editor and viewer are present, editor wins.

### 2.3 CSTAR roles and groups in session

The external UI also fetches CSTAR tenant roles and groups for the logged-in user.

Those values are used for:

- tenant-scoped UI visibility
- WIL actor matching by role
- WIL actor matching by group

Important distinction:

- Tenant-project sync uses CSTAR shared-service roles to assign `n8n` project membership.
- Session APIs also expose CSTAR groups and the union of their shared-service roles for UI and WIL logic.
- Not every CSTAR role or group changes `n8n` project membership.

## 3. Initial access request for baseline platform access

This is the path for a user who can authenticate with OIDC but does not receive a usable global `n8n` role from either the upstream OIDC role claim or the CSTAR managed project-role fallback.

Typical flow:

1. The user signs in through OIDC.
2. The callback cannot resolve a valid global role for the user from either the upstream role claim or CSTAR managed project roles.
3. The user is redirected to the access-request page.
4. The user submits a justification.
5. A `global:owner` or `global:admin` reviews the request.
6. On approval, the system assigns `global:member`.

Approval side effects:

- The system assigns `global:member` in CSS SSO.
- If the user does not yet exist in `n8n`, the system creates the user and their personal project.
- If the user already exists but has no role or is disabled, the system updates and re-enables them.
- The system assigns a generated tenant ID to the user's personal project if it does not already have one.

This means the initial approved access level is `global:member`.

Important clarification:

- This flow grants baseline platform access when OIDC and the CSTAR fallback did not already do so.
- It does not by itself grant access to any CSTAR tenant team project.
- Tenant team project access still depends on CSTAR tenant membership and CSTAR tenant shared-service roles.

## 4. CSTAR tenant and `n8n` project syncing

### 4.1 Mapping model

The platform currently uses the following model.

| Concept                | Mapping                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| CSTAR tenant           | One `n8n` team project                                                                      |
| CSTAR tenant user      | One `n8n` project user relation per mapped project, if the user has a qualifying CSTAR role |
| CSTAR tenant user role | Mapped to `project:editor`, `project:viewer`, or no managed project role                    |

The tenant-to-project mapping is stored in `tenant_project_relation`.

Rules:

- One tenant maps to at most one project.
- One project maps to at most one tenant.
- The team project is created on demand when a qualifying tenant user logs in.

### 4.2 Sync behavior at login

After successful OIDC login, tenant-project sync runs in the background.

For each CSTAR tenant the user belongs to:

1. Load the user's CSTAR shared-service roles for that tenant.
2. Resolve the highest applicable `n8n` project role.
3. Create the team project if needed.
4. Add, update, or remove the user's `n8n` project relation.

After processing active tenants, the sync also removes stale managed project relations for tenant projects the user no longer belongs to.

Important behavior:

- Sync is non-blocking and does not fail login.
- Partial CSTAR failures do not block other tenant syncs.
- Only managed roles are updated or removed.
- Manually assigned non-managed project roles are preserved.

### 4.3 Personal project versus tenant project

A user's personal project is separate from CSTAR tenant team projects.

Current behavior:

- Access-request approval ensures the personal project has a generated tenant mapping.
- Successful OIDC login also ensures the personal project has a generated tenant mapping once the user has a valid global role.
- This personal-project tenant mapping is not a CSTAR tenant.
- Team projects created by tenant-project sync are the CSTAR-backed tenant projects.

That distinction matters when reading code and docs that use the word `tenant` broadly.

## 5. How custom API authorization uses tenant-project sync

Workflow interaction APIs do not authorize only on the API key.

They also require tenant scoping:

1. Read `X-TENANT-ID`.
2. Resolve that tenant ID to one or more project IDs from `tenant_project_relation`.
3. Load the API key user's accessible `n8n` project IDs.
4. Intersect those two sets.
5. Reject the request if the intersection is empty.

This means a valid API key is not enough. The caller must also be in the `n8n` project that is mapped to the tenant in question.

## 6. Important clarifications

### 6.1 Global roles are not the same as CSTAR tenant roles

This is the main source of confusion.

- Global roles control baseline platform privileges.
- CSTAR tenant roles control tenant project membership and tenant-scoped behavior.
- A user can be a `global:member` and still have no access to any CSTAR tenant team project.

### 6.2 In this service, "tenant role" usually means project role

The platform implementation is:

- CSTAR tenant -> `n8n` team project
- tenant user access -> `n8n` project relation
- tenant user role -> `n8n` project role

So when discussing `n8n` authorization, `project role` is usually the more precise term.

### 6.3 Not all CSTAR roles are enforced as `n8n` project roles

At the moment, the managed project-role mapping is intentionally narrow.

- `project:editor` maps to `project:editor`
- `project:viewer` maps to `project:viewer`
- other CSTAR roles may still appear in session data for UI or WIL logic
- other CSTAR roles do not currently create additional `n8n` project-role mappings

## 7. Known documentation and design gaps

The following gaps still exist and are worth documenting separately or tightening over time.

| Gap                                                    | Current state                                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dedicated access-request documentation                 | The flow exists in code, but there was no standalone doc before this one.                                                                                                 |
| Clear separation of global roles vs CSTAR tenant roles | Previously spread across multiple docs and easy to confuse.                                                                                                               |
| Personal project "tenant" mapping explanation          | Implemented in code, but not clearly documented elsewhere.                                                                                                                |
| WIL tenant list source                                 | Some UI/WIL docs note that tenant listing still relies on `tenant_project_relation` placeholders and TODOs rather than direct CSTAR-backed user-specific tenant metadata. |
| End-to-end deprovisioning narrative                    | Sync behavior for tenant project relations is documented, but a single offboarding/deprovisioning story across OIDC, CSS SSO, CSTAR, and `n8n` is still not consolidated. |
| Unsupported CSTAR role behavior                        | The code ignores unmapped CSTAR tenant roles for project-role sync, but that rule was not previously called out in one place.                                             |

## Related docs

- `docs/platform/access-request.md`
- `docs/platform/global-roles-vs-cstar-roles.md`
- `docs/platform/personal-project-tenant-mapping.md`
- `docs/platform/user-offboarding-and-deprovisioning.md`
- `docs/platform/cstar-role-mapping-rules.md`
- `docs/external-hooks/oidc.md`
- `docs/external-ui/tenant-project-sync.md`
- `docs/external-ui/tenant-roles-in-session.md`
- `docs/external-ui/wil-tenant-source-and-limitations.md`
- `docs/external-hooks/custom-api.md`
- `docs/external-hooks/workflow-interaction-api-validations.md`
- `docs/external-hooks/workflow-interaction-layer.md`
- `docs/platform/high-level-architecture.md`
