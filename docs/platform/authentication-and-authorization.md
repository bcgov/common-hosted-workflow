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

### 1.1 Unified OIDC sign-in (single authorization flow) — stable contract

`n8n` and the external UI share one backend-managed OIDC authorization flow. Every valid OIDC identity receives an external UI session; an `n8n` session (`n8n-auth` cookie) is issued only after n8n eligibility succeeds. `OIDC_ISSUER` is required in every mode (AUTH-03, `validateN8nOidcConfig` / `fetchOidcDiscoveryDocument`); provider fetches are bounded by `OIDC_PROVIDER_TIMEOUT_MS` default 10s via `fetchWithTimeout` (AUTH-06); JWKS resolvers are reused per `jwks_uri` (`jwksCache`).

High-level flow:

1. Browser opens `GET /rest/auth/oidc/login` (canonical; `GET /ui-api/auth/login` is a deprecated **redirect-only** alias `302 → /rest/auth/oidc/login?returnTo` until `2026-09-30`).
2. The hook validates `returnTo` (`/ui/*`, fallback `/ui/`) via `return-target` policy (`createReturnTargetPolicy` / `resolveReturnTarget`) and checks an existing `n8n-auth` cookie — valid without a `returnTo` redirects directly to `/`, otherwise a fresh authorization starts so the UI can obtain a new exchange handle.
3. The hook creates signed `n8n-oidc-state` / `n8n-oidc-nonce` cookies (`HttpOnly` `Secure` when `N8N_BASE_URL` is `https` `SameSite=Lax` `Path=/` 15 min, `exp` 900s) and redirects to the provider `authorization_endpoint` (PKCE `code_challenge` S256).
4. The provider returns to `GET /rest/auth/oidc/callback` (sole callback; `GET /ui-api/auth/callback` and `OIDC_FRONTEND_HOOK_MODE` were removed) with `code` + `state`.
5. The callback validates `state`/`nonce` cookies before token exchange (`verifySignedCookie` HMAC `timingSafeEqual`), exchanges `code` for tokens (requires `id_token` else `Missing ID token`), cryptographically verifies the `id_token` (`createRemoteJWKSet` per `jwks_uri` reused, `jwtVerify` with `issuer` always required + `audience`/`exp`/`nonce`) and that discovered `issuer` exactly equals the configured `issuerUrl` (`OIDC discovery issuer mismatch`), and requires `userinfo.sub` to equal the verified `id_token` `sub`.
6. The hook extracts `email`/`roles` (`roles` = first valid `global:owner`/`admin`/`member` in `claims[OIDC_ROLES_CLAIM]` comma-list) and validates email (`isValidEmail`).
7. The coordinator resolves `nextRole` via single authoritative `resolveNextRoleInternal` (AUTH-07, `oidc.ts` delegates): if `SSO_RESTRICT_NO_ROLE=false` missing roles fall back to `global:member`; if `true`, missing roles check CSTAR managed project roles (`project:editor`/`viewer`/`admin` in any tenant via `getUserTenantsStrict` + `getUserSharedServiceRolesStrict`) for a `global:member` fallback, otherwise empty; CSTAR verification failure fail-closed (`Unable to verify CSTAR tenant roles during sign-in`).
8. **Eligible (`nextRole` present)** → creates or reuses the n8n user (first user → `global:owner`; existing user role synced with last-owner protection; previously disabled users re-enabled), ensures tenant mapping, schedules non-blocking pre-warm + tenant-project sync (`runPostLoginTenantWork` `Promise.allSettled`, missing token/CSTAR skips), then issues both artifacts: `n8n-auth` cookie (`HttpOnly` `Secure` when https `SameSite=Lax` `Path=/` 24 h sliding `getAuthCookieOptions`, JWT 7d inside) + one-time UI exchange handle (`chwf:ui-oidc:session:<handle>` `crypto.randomBytes(24).base64url`, 60 s single-use `getDel`, appended via `appendSessionToReturnTo` exactly-one `session`) to the validated `returnTo` (preserving query/fragment). **Atomic issuance (AUTH-04):** `prepareUiSessionExchange` runs before `createAuthToken`; on `createAuthToken` failure the handle is `consumeUiSessionExchange`/`deleteUiSessionExchange` idempotently and `sid` is restored (re-login preserves prior session) or deleted.
9. **Access-request (`nextRole` empty)** → no n8n user created for new identities; existing ineligible users are disabled (`disabled=true`, role preserved, not synced to empty string) and lose n8n-derived capabilities; UI exchange handle only, redirect to `/ui/access-request?session=...` **with `Set-Cookie: clear n8n-auth`** (`authService.clearCookie` at the shared callback boundary `oidc.ts` — terminates any prior `n8n-auth` same- or cross-identity, AUTH-01).
10. **Failure** (missing `id_token`/`jwks_uri`, signature/issuer/audience/nonce/expiry/userinfo `sub` mismatch, CSTAR verification error, Redis/provisioning/role-sync failure) → no artifact, redirect to `/ui?error=<stable public message>` (allowlist: generic `Authentication failed` or `Invalid issuer`/`Unable to verify…`; detailed causes only in server logs via `toPublicMessage` / `toPublicRouteMessage`; no raw provider text in redirect — AUTH-03).

This is the sole browser authentication path; `GET /ui-api/auth/callback` and UI OIDC state records were removed. Valid `returnTo`/`continue` targets are confined to allowed origins (`N8N_BASE_URL`/`UI_APP_BASE_URL` via `createReturnTargetPolicy`) and `/ui/*` (or `/` for continuation); hostile forms (`//`, `\`, `%5c`, foreign origins, non-http schemes, disallowed paths, encoded dot-segment) fall back to `/ui/` (or `/`) and never receive a handle. The SPA trades the handle once at **`POST /ui-api/auth/exchange`** with JSON `{"session": handle}` (not `GET`).

> **Read the lifecycle matrix:** For credential type per endpoint, TTLs, refresh owner, and cross-artifact behavior see the canonical matrix `docs/platform/user-authn-authz-summary.md:0.1` (Artifact Contract / Endpoint Inventory / Cross-Artifact / Identity×Operation). That matrix is the single source of which credential each endpoint accepts and which system authorizes it.

Important details:

- The first user ever created becomes `global:owner`.
- Later users normally become the mapped OIDC role (first valid `global:owner`/`admin`/`member` in the comma list).
- If `SSO_RESTRICT_NO_ROLE=false`, a user with no valid upstream role falls back to `global:member`.
- If `SSO_RESTRICT_NO_ROLE=true` and the user has any CSTAR managed project role in any tenant, the user also falls back to `global:member`.
- If `SSO_RESTRICT_NO_ROLE=true` and the user has no valid upstream role and no CSTAR managed project role, the user is not provisioned (new) or is disabled preserving role (existing) and is redirected into the access-request flow with a UI-only session.
- If CSTAR verification fails during that fallback check, sign-in fails instead of silently routing the user to access request.
- Browser `n8n` login entry points `/login` and `/signin` are unconditionally replaced with `/ui` by the redirect-only frontend hook (`/assets/oidc-frontend-hook.js`, no mode switch); n8n logout is intercepted to `GET /rest/auth/oidc/logout`.

Session and logout details are in the extended flow: the SPA trades the `session` handle once at `POST /ui-api/auth/exchange`, bearer tokens are revokable server-side (`tokenemail`/`sessionIssueId` + `getDel` handles), and logout ownership/revocation is described below (canonical `GET /rest/auth/oidc/logout` trusts only a consumed `logout` handle or valid `n8n-auth`; aliases are redirect-only until `2026-09-30`).

### 1.2 Custom API endpoint authentication

There are two main custom API surfaces plus the UI API (which uses the OIDC-derived bearer, distinct from upstream tokens).

| API surface                                               | Credential accepted                                                                                                                                                                                                               | Authorizer                                                                                                                                   | Notes                                                                                                                                                                                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/ui-api/*` (session/exchange/logout-prepare + protected) | `Authorization: Bearer` — raw `access_token` (`UI_AUTH_USE_SEPARATE_TOKEN=false`) or app JWT (`true`, `jwtVerify` HS256 + `sid` check) via `getUiSession` / `resolveUiRequestContext`; `n8n-auth` never authenticates `/ui-api/*` | `ui-oidc-session.ts` (`resolveLocalUiSession`/`resolveUpstreamUiSession` `issuer`/`exp`/`sid`/`tokenemail`) + `permissions.ts` / `checkRole` | CSTAR calls use server-side `upstreamAccessToken` (`session.upstreamAccessToken` / `getUiOidcAccessTokenByEmail` / `refreshAccessToken`), never the UI bearer in separate-token mode (AUTH-02); `/ui-api/projects` and `wil.ts` are the CSTAR-bound examples |
| Admin custom APIs under `/rest/custom/admin/*`            | `X-N8N-API-KEY`                                                                                                                                                                                                                   | n8n user + `global:owner`/`global:admin`                                                                                                     | —                                                                                                                                                                                                                                                            |
| Workflow interaction APIs under `/rest/custom/v1/*`       | `X-N8N-API-KEY`, `X-TENANT-ID`, and `Authorization: Bearer <INTERNAL_AUTH_TOKEN>` for internal POST create routes                                                                                                                 | API key user + tenant-project intersection                                                                                                   | —                                                                                                                                                                                                                                                            |

Admin custom APIs:

- Authenticate with `X-N8N-API-KEY`.
- The API key must belong to an `n8n` user.
- The caller must be `global:owner` or `global:admin`.

Workflow interaction APIs:

- Authenticate the caller with `X-N8N-API-KEY`.
- Require `X-TENANT-ID` so the request can be scoped to a tenant/project mapping.
- For internal create routes, also require `Authorization: Bearer <INTERNAL_AUTH_TOKEN>`.
- The API key user must have access to the mapped `n8n` project, or the request is rejected.

UI API credential separation (AUTH-02): the presented UI bearer is the UI session credential; the upstream OIDC `access_token` for CSTAR is stored server-side (`chwf:ui-oidc:acctoken:<email>` + reverse `tokenemail:sha256(token)`) and resolved via `session.upstreamAccessToken` or `getUiOidcAccessTokenByEmail`, with `refreshAccessToken` closure used during `resolveUiRequestContext`. Forwarding the app JWT upstream is a tested negative (`ui-api.test.ts` separate-token regression).

## 2. Authorization model

### 2.1 Global roles

Global roles are platform-wide `n8n` roles:

- `global:owner`
- `global:admin`
- `global:member`

These are not tenant-scoped.

These roles come from the upstream OIDC role claim (first valid `global:owner`/`admin`/`member` in `claims[OIDC_ROLES_CLAIM]`), from the CSTAR managed project-role fallback in the single login callback, or from the access-request approval flow.

What they are used for:

- `global:owner` and `global:admin` can use admin-only APIs and review access requests.
- `global:member` is the normal baseline platform user role.
- A user with no valid upstream global role may still become `global:member` if CSTAR shows any managed tenant project role; otherwise the user is not provisioned (new) or is disabled preserving their stored role (existing) and routed to the access-request flow with a UI-only session. The legacy claim that such users are "synced to an empty role" is obsolete — the role is preserved and the account is disabled.

Every authenticated identity receives an external UI session; only eligible identities (`nextRole` present) receive `n8n-auth` and n8n-derived UI capabilities. Ineligible/disabled identities receive `canRequestAccess` only (see §3).

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

This is the path for a user who can authenticate with OIDC but is **ineligible** for `n8n` (no valid `global:owner`/`admin`/`member` from the OIDC role claim nor CSTAR fallback).

Typical flow:

1. The user signs in through the single OIDC flow (`GET /rest/auth/oidc/login` → callback).
2. The callback cannot resolve a valid `nextRole` from either the upstream role claim (first valid wins) or CSTAR managed project roles (or CSTAR check is not configured).
3. No `n8n-auth` is issued. For a new identity, no n8n user is created; for an existing user, the account is disabled (`disabled=true`) preserving the stored role and n8n-derived permissions are denied. A one-time UI exchange handle is still issued.
4. The browser is redirected to `/ui/access-request?session=<handle>` (validated `returnTo` policy), the SPA exchanges the handle for a bearer and shows the access-request page (capability `canRequestAccess` only).
5. The user submits a justification.
6. A `global:owner` or `global:admin` reviews the request.
7. On approval, the system assigns `global:member`.

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

### 4.2 Sync and pre-warm behavior at login

After successful **eligible** OIDC login (ineligible users do not trigger it), two post-login operations run together non-blocking via `post-login-tenant.ts` (`runPostLoginTenantWork` → `prewarmTenantRolesAndGroups` + `syncTenantsForUser` with `Promise.allSettled`), sharing a single CSTAR tenants fetch:

For each CSTAR tenant the user belongs to (sync):

1. Load the user's CSTAR shared-service roles for that tenant.
2. Resolve the highest applicable `n8n` project role.
3. Create the team project if needed.
4. Add, update, or remove the user's `n8n` project relation.

Pre-warm populates Redis `tenantroles:{email}` / `tenantgroups:{email}` (1 h TTL) via one `getUserGroupsWithRoles` per tenant, so the first `/ui-api/session` after login hits cache.

After processing active tenants, the sync also removes stale managed project relations for tenant projects the user no longer belongs to.

Important behavior:

- Both operations are non-blocking and never fail login; failures are logged (`Tenant roles pre-warm failed` / `Tenant project sync failed`) but the redirect and both session artifacts already succeeded.
- Missing `access_token` or unconfigured CSTAR skips both.
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

## Supplementary document status (AUTH-09)

| Document                                                | Status                                | Note                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/external-hooks/oidc.md`                           | **Canonical — updated 2026-08-31**    | Issuer mandatory (AUTH-03), `POST /exchange` with body, `access-request` cookie clear (AUTH-01), separate vs raw credential (AUTH-02), bounded `fetchWithTimeout` + JWKS reuse (AUTH-06), atomic issuance (AUTH-04), race safety (AUTH-05), alias deprecation `2026-09-30` |
| `docs/platform/user-authn-authz-summary.md`             | **Canonical — reconciled 2026-08-31** | Leads with Dual-Session Contract Matrix `§0.1`; precise TTL/method/alias/public-error/atomic wording; sequence diagrams for login/refresh/logout/account-switch                                                                                                            |
| `external-ui/README.md`                                 | **Updated 2026-08-31**                | Correct `POST /ui-api/auth/exchange` with body; `OIDC_ISSUER` required note                                                                                                                                                                                                |
| `docs/development-setup/sandbox.md`                     | **Updated 2026-08-31**                | Correct `POST /ui-api/auth/exchange`; notes `OIDC_ISSUER` required + `access-request` cookie clear                                                                                                                                                                         |
| `docs/external-ui/tenant-roles-in-session.md`           | **Updated 2026-08-31**                | Adds upstream-vs-UI credential separation and combined `getTenantRolesAndGroupsForSession`                                                                                                                                                                                 |
| `docs/platform/access-request.md`                       | Accurate, narrow                      | Access-request flow only                                                                                                                                                                                                                                                   |
| `docs/platform/global-roles-vs-cstar-roles.md`          | Accurate, narrow                      | Global vs CSTAR role distinction                                                                                                                                                                                                                                           |
| `docs/platform/cstar-role-mapping-rules.md`             | Accurate, narrow                      | Managed role mapping                                                                                                                                                                                                                                                       |
| `docs/platform/personal-project-tenant-mapping.md`      | Accurate, narrow                      | Personal vs tenant project                                                                                                                                                                                                                                                 |
| `docs/external-ui/tenant-project-sync.md`               | **Superseded in part**                | Previously claimed `ui-api.ts /auth/callback` syncs — now only `GET /rest/auth/oidc/callback` via `post-login-tenant.ts` (see canonical `§1.3` post-login)                                                                                                                 |
| `docs/external-ui/WIL/authentication-and-tokens.md`     | **Stale — superseded**                | Missing `sid`/60s handle/5-min window/`OIDC_ISSUER` mandatory/bounded fetches                                                                                                                                                                                              |
| `docs/external-hooks/architecture.md`                   | **Stale — superseded**                | Omits `logout`/`exchange`/`coordinator`/`post-login-tenant` and race safety                                                                                                                                                                                                |
| `docs/external-ui/wil-tenant-source-and-limitations.md` | Accurate — with TODO                  | WIL tenant source still via `tenant_project_relation` placeholders (documented known gap)                                                                                                                                                                                  |

`docs/external-hooks/architecture.md:188`, `docs/external-ui/tenant-project-sync.md:27`, and `docs/external-ui/WIL/authentication-and-tokens.md:6` remain on disk but are explicitly superseded; do not rely on their method or TTL claims — use the canonical docs above.

## Related docs

- `docs/platform/access-request.md`
- `docs/platform/global-roles-vs-cstar-roles.md`
- `docs/platform/personal-project-tenant-mapping.md`
- `docs/platform/user-offboarding-and-deprovisioning.md`
- `docs/platform/cstar-role-mapping-rules.md`
- `docs/external-hooks/oidc.md`
- `docs/external-ui/tenant-project-sync.md` — superseded in part (see status table)
- `docs/external-ui/tenant-roles-in-session.md`
- `docs/external-ui/wil-tenant-source-and-limitations.md`
- `docs/external-hooks/custom-api.md`
- `docs/external-hooks/workflow-interaction-api-validations.md`
- `docs/external-hooks/workflow-interaction-layer.md`
- `docs/platform/high-level-architecture.md`
