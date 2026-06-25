# Tenant Roles and Groups in Session

Exposes the user's CSTAR shared-service roles **and group memberships** per tenant in the session API, enabling role- and group-based UI visibility in the external UI and actor matching in the Workflow Interaction Layer.

## Overview

When a user logs in, their tenant roles and groups are fetched from CSTAR and cached in Redis. The `/ui-api/session` and `/ui-api/whoami` endpoints return both alongside the existing session data.

Both are derived from a **single CSTAR API call** per tenant — `getUserGroupsWithRoles` — which returns the groups a user belongs to along with the shared-service roles attached to each group:

- **Roles** are extracted by collecting the unique `sharedServiceRoles[].name` values across all groups the user belongs to in that tenant.
- **Groups** are the group names themselves (e.g. `UI Actor`, `Ministry Editors`).

The frontend uses lightweight hooks to conditionally show/hide components based on role membership. The WIL backend uses both roles and groups to match actions and messages assigned to the user.

## Architecture

```
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────────┐
│   External UI        │      │    Backend (session)  │      │          Redis           │
│   useTenantRoles()   │◀────▶│  /ui-api/session      │◀────▶│  tenantroles:{email}     │
│   useHasRole()       │      │  /ui-api/whoami       │      │  tenantgroups:{email}    │
└──────────────────────┘      └──────────┬───────────┘      │  (1h TTL each)           │
                                         │ (cache miss)      └──────────────────────────┘
                              ┌──────────▼───────────┐
                              │     CSTAR API         │
                              │  /users/{id}/tenants  │
                              │  /tenants/{id}/users  │
                              │  /{id}/groups/        │
                              │  shared-service-roles │
                              └──────────────────────┘
```

## Data Shape

### Backend Response (`/ui-api/session`)

```json
{
  "authenticated": true,
  "user": { "subject": "...", "email": "...", "name": "..." },
  "oidc": { "...": "..." },
  "n8nUser": { "...": "..." },
  "permissions": { "...": "..." },
  "tenantRoles": [
    {
      "tenantId": "abc-123",
      "tenantName": "My Ministry Team",
      "roles": ["project:editor", "ui:actor"]
    }
  ],
  "tenantGroups": [
    {
      "tenantId": "abc-123",
      "tenantName": "My Ministry Team",
      "groups": ["UI Actor", "Ministry Editors"]
    }
  ]
}
```

### TypeScript Types

```typescript
type TenantRole = {
  tenantId: string;
  tenantName: string;
  roles: string[];
};

type TenantGroup = {
  tenantId: string;
  tenantName: string;
  groups: string[];
};
```

The `roles` array contains the CSTAR shared-service role names the user holds in that tenant (e.g. `project:editor`, `project:viewer`, `ui:actor`). These are derived from the roles attached to the user's groups — not directly assigned to the user.

The `groups` array contains the names of CSTAR groups the user belongs to in that tenant (e.g. `UI Actor`, `Admins`).

## How Roles and Groups Are Derived

Both are fetched from a **single CSTAR endpoint** per tenant:

```
GET /api/v1/tenants/{tenantId}/users/{ssoUserId}/groups/shared-service-roles
```

This returns the groups the user belongs to in that tenant, with each group's shared-service roles embedded:

```json
[
  {
    "name": "UI Actor",
    "sharedServiceRoles": [{ "name": "ui:actor" }, { "name": "project:editor" }]
  },
  {
    "name": "Ministry Editors",
    "sharedServiceRoles": [{ "name": "project:editor" }]
  }
]
```

From this response:

- **`groups`** = `["UI Actor", "Ministry Editors"]` (the group names)
- **`roles`** = `["ui:actor", "project:editor"]` (deduplicated union of all `sharedServiceRoles[].name`)

## Frontend Usage

### Available Hooks

All hooks are exported from `src/state/session.ts`:

```typescript
import { useTenantRoles, useHasRole, useHasTenantRole } from '../state/session';
```

### `useTenantRoles()`

Returns the full list of tenant roles for the current user. Use this for custom logic that needs to iterate over tenants.

```tsx
const tenantRoles = useTenantRoles();

return (
  <ul>
    {tenantRoles.map((t) => (
      <li key={t.tenantId}>
        {t.tenantName}: {t.roles.join(', ')}
      </li>
    ))}
  </ul>
);
```

### `useHasRole(roleName: string)`

Returns `true` if the user holds the specified role in **any** tenant.

```tsx
const canEdit = useHasRole('project:editor');

if (!canEdit) {
  return <p>You do not have edit access.</p>;
}
```

### `useHasTenantRole(tenantId: string, roleName: string)`

Returns `true` if the user holds the specified role in a **specific** tenant.

```tsx
const isAdmin = useHasTenantRole(selectedTenantId, 'project:admin');

return (
  <>
    <WorkflowList tenantId={selectedTenantId} />
    {isAdmin && <AdminPanel tenantId={selectedTenantId} />}
  </>
);
```

### Combining with Existing Permissions

Tenant roles are complementary to the existing `usePermissions()` hook. Use permissions for n8n-level access control and tenant roles for tenant-scoped visibility:

```tsx
const permissions = usePermissions();
const canEditInTenant = useHasTenantRole(tenantId, 'project:editor');

const canShare = permissions?.canShareWorkflows ?? false;
const showEditControls = canShare && canEditInTenant;
```

## Backend Flow

### 1. Login (Pre-warm)

At OIDC callback (`/ui-api/auth/callback`), after a successful login:

```
Login success
  └── services.tenant.prewarmTenantRolesAndGroups({ email, ssoUserId, accessToken })
        └── CstarService.getUserTenants(...)
        └── CstarService.getUserGroupsWithRoles(...) per tenant  ← single call derives both
              ├── Extract role names (sharedServiceRoles[].name, deduplicated)
              └── Extract group names (group.name)
        └── Store TenantRole[] in Redis  (keyed by email, 1h TTL)
        └── Store TenantGroup[] in Redis (keyed by email, 1h TTL)
```

This runs **non-blocking** (fire-and-forget). If it fails, the first `/session` call will fetch both on-demand.

### 2. Session Resolution (Cache-Aside)

On every `/ui-api/session` or authenticated request:

```
resolveUiRequestContext()
  ├── services.tenant.getTenantRolesForSession({ email, ssoUserId })
  │     └── Check Redis (getUiTenantRoles)
  │           ├── Cache hit  → return cached roles
  │           └── Cache miss → fetch from CSTAR, store in Redis, return roles
  │
  └── services.tenant.getTenantGroupsForSession({ email, ssoUserId })
        └── Check Redis (getUiTenantGroups)
              ├── Cache hit  → return cached groups
              └── Cache miss → fetch from CSTAR, store in Redis, return groups
```

> **Note:** On a cold cache (e.g. first request after token refresh), each resolver independently calls CSTAR. When pre-warm runs at login it populates both caches in a single combined fetch, avoiding this double call on the first authenticated request.

### 3. Token Refresh (Invalidation)

When the upstream OIDC access token is refreshed:

```
refreshSessionByEmail()
  ├── invalidateTenantRoles(email)   → Delete tenantroles:{email}
  └── invalidateTenantGroups(email)  → Delete tenantgroups:{email}
```

Both caches are invalidated together. The next session resolution re-fetches from CSTAR with the new access token.

### 4. Logout (Cleanup)

On logout, both caches are deleted alongside all other OIDC tokens:

```
deleteUiOidcTokens(email)
  └── Deletes: refresh token, ID token, access token, tenant roles, tenant groups
```

## Caching Details

| Property    | Roles                                   | Groups                                  |
| ----------- | --------------------------------------- | --------------------------------------- |
| Storage     | Redis (same instance as OIDC store)     | Redis (same instance as OIDC store)     |
| Key format  | `{prefix}tenantroles:{email}`           | `{prefix}tenantgroups:{email}`          |
| Default TTL | 1 hour                                  | 1 hour                                  |
| Invalidated | On token refresh, on logout             | On token refresh, on logout             |
| Pre-warmed  | At login (non-blocking, combined fetch) | At login (non-blocking, combined fetch) |
| Cache miss  | Fetches from CSTAR on-demand            | Fetches from CSTAR on-demand            |

Both caches share the same 1-hour TTL. If a user's CSTAR group memberships or role assignments change, the change will be reflected within 1 hour (or immediately after the next token refresh or re-login).

## WIL Actor Matching

Roles and groups are used by the Workflow Interaction Layer to match actions and messages assigned to the user. When listing actions or messages, the WIL routes build an OR-based query that matches on any of:

| `actor_type` | Matched against                                   |
| ------------ | ------------------------------------------------- |
| `user`       | User's email address or OIDC subject (legacy)     |
| `role`       | Any role name in `tenantRoles[tenantId].roles`    |
| `group`      | Any group name in `tenantGroups[tenantId].groups` |

This means a workflow can assign an action to a role (e.g. `project:editor`) or a group (e.g. `UI Actor`) rather than a specific user, and all members of that role or group will see the item in their WIL inbox.

See [WIL Backend API](./WIL/backend-api.md) for full details on actor matching.

## Known Role Names

These are the CSTAR shared-service role names used for n8n:

| Role Name        | Meaning                                  |
| ---------------- | ---------------------------------------- |
| `project:editor` | Can create/edit workflows in the tenant  |
| `project:viewer` | Can view workflows in the tenant         |
| `project:admin`  | Full administrative access to the tenant |
| `ui:actor`       | Can interact with WIL actions/messages   |

Additional roles and groups may be added in CSTAR without requiring code changes — they will flow through automatically.

## File Locations

### Backend (`external-hooks`)

| File                                 | Purpose                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/api/services/tenant.service.ts` | `getTenantRolesForSession`, `getTenantGroupsForSession`, `prewarmTenantRolesAndGroups`, `fetchTenantRolesAndGroupsFromCstar` |
| `src/api/helpers/tenant-roles.ts`    | Cache-aside helper for roles (Redis get/set/delete)                                                                          |
| `src/api/helpers/tenant-groups.ts`   | Cache-aside helper for groups (Redis get/set/delete)                                                                         |
| `src/api/helpers/ui-oidc-store.ts`   | Redis functions for both roles and groups; `TenantRole` and `TenantGroup` types                                              |
| `src/api/helpers/ui-oidc.ts`         | `UiResolvedSession`, `UiSessionSummary`, `WhoamiResponse` — include both `tenantRoles` and `tenantGroups`                    |
| `src/api/helpers/ui-oidc-session.ts` | Calls `invalidateTenantRoles` and `invalidateTenantGroups` on token refresh                                                  |
| `src/api/routes/ui-api.ts`           | Session resolution + login pre-warm                                                                                          |
| `src/api/types/actor-matchers.ts`    | `ActorMatchers` type used by WIL routes                                                                                      |

### Frontend (`external-ui`)

| File                             | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `src/services/backend/auth.ts`   | `TenantRole`, `TenantGroup` types; updated response types |
| `src/state/session.ts`           | `useTenantRoles`, `useHasRole`, `useHasTenantRole` hooks  |
| `src/auth/session-bootstrap.tsx` | Maps `tenantRoles` and `tenantGroups` from API response   |

## Configuration

No new environment variables are required. The feature uses:

| Variable            | Required For                                                   |
| ------------------- | -------------------------------------------------------------- |
| `CSTAR_BASE_URL`    | Fetching roles/groups from CSTAR (if empty, both will be `[]`) |
| `UI_OIDC_REDIS_URL` | Caching (already required for session management)              |

## Edge Cases

| Scenario                             | Behavior                                                      |
| ------------------------------------ | ------------------------------------------------------------- |
| CSTAR not configured                 | `tenantRoles` and `tenantGroups` are always `[]`              |
| CSTAR unreachable at login           | Pre-warm fails silently; first session call retries on-demand |
| CSTAR unreachable at session time    | Returns `[]` (no access token or fetch failure)               |
| User has no tenants                  | Both `tenantRoles` and `tenantGroups` are `[]`                |
| User belongs to groups with no roles | Tenant appears with `roles: []`; groups still populated       |
| User has no group memberships        | Both `roles` and `groups` are `[]` for that tenant            |
| Redis unavailable                    | Falls through to CSTAR on every session call                  |
| Roles/groups assigned after login    | Reflected after 1h TTL expires or on next token refresh       |
| Some tenants fail to fetch           | Successful tenants are still returned; failures are logged    |
