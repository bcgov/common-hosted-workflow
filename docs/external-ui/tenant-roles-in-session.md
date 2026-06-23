# Tenant Roles in Session

Exposes the user's CSTAR shared-service roles per tenant in the session API, enabling role-based UI visibility in the external UI.

## Overview

When a user logs in, their tenant roles are fetched from CSTAR and cached in Redis. The `/ui-api/session` and `/ui-api/whoami` endpoints return these roles alongside the existing session data. The frontend uses lightweight hooks to conditionally show/hide components based on role membership.

## Architecture

```
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│   External UI        │      │    Backend (session)  │      │       Redis          │
│   useTenantRoles()   │◀────▶│  /ui-api/session      │◀────▶│  tenantroles:{email} │
│   useHasRole()       │      │  /ui-api/whoami       │      │  (1h TTL)            │
└──────────────────────┘      └──────────┬───────────┘      └──────────────────────┘
                                         │ (cache miss)
                              ┌──────────▼───────────┐
                              │     CSTAR API         │
                              │  /users/{id}/tenants  │
                              │  /tenants/{id}/...    │
                              └──────────────────────┘
```

## Data Shape

### Backend Response (`/ui-api/session`)

```json
{
  "authenticated": true,
  "user": { "subject": "...", "email": "...", "name": "..." },
  "oidc": { ... },
  "n8nUser": { ... },
  "permissions": { ... },
  "tenantRoles": [
    {
      "tenantId": "abc-123",
      "tenantName": "My Ministry Team",
      "roles": ["project:editor"]
    },
    {
      "tenantId": "def-456",
      "tenantName": "Another Tenant",
      "roles": ["project:viewer"]
    }
  ]
}
```

### TypeScript Type

```typescript
type TenantRole = {
  tenantId: string;
  tenantName: string;
  roles: readonly string[];
};
```

The `roles` array contains the CSTAR shared-service role names assigned to the user within that specific tenant (e.g. `project:editor`, `project:viewer`, `project:admin`).

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

// Example: list all tenants where user has any role
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

Returns `true` if the user holds the specified role in **any** tenant. Use for global feature gates.

```tsx
const canEdit = useHasRole('project:editor');

if (!canEdit) {
  return <p>You do not have edit access.</p>;
}
```

### `useHasTenantRole(tenantId: string, roleName: string)`

Returns `true` if the user holds the specified role in a **specific** tenant. Use when the UI is scoped to a single tenant.

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

// n8n-level: can the user share workflows at all?
const canShare = permissions?.canShareWorkflows ?? false;

// Tenant-level: does the user have edit access in this specific tenant?
const showEditControls = canShare && canEditInTenant;
```

## Backend Flow

### 1. Login (Pre-warm)

At OIDC callback (`/ui-api/auth/callback`), after a successful login:

```
Login success
  └── services.tenant.prewarmTenantRoles({ email, ssoUserId, accessToken })
        └── CstarService.getUserTenants(...)
        └── CstarService.getUserSharedServiceRoles(...) per tenant
        └── Store result in Redis (keyed by email, 1h TTL)
```

This runs **non-blocking** (fire-and-forget). If it fails, the first `/session` call will fetch roles on-demand.

### 2. Session Resolution (Cache-Aside)

On every `/ui-api/session` or authenticated request:

```
resolveUiRequestContext()
  └── services.tenant.getTenantRolesForSession({ email, ssoUserId })
        └── Check Redis cache (getUiTenantRoles)
        │     └── Cache hit → return cached roles
        └── Cache miss → fetch from CSTAR using stored access token
              └── Store result in Redis
              └── Return roles
```

### 3. Token Refresh (Invalidation)

When the upstream OIDC access token is refreshed:

```
refreshSessionByEmail()
  └── invalidateTenantRoles(email)
        └── Delete Redis key
```

The next session resolution will re-fetch roles with the new access token.

### 4. Logout (Cleanup)

On logout, the tenant roles cache is deleted alongside all other OIDC tokens:

```
deleteUiOidcTokens(email)
  └── Deletes: refresh token, ID token, access token, tenant roles
```

## Caching Details

| Property    | Value                               |
| ----------- | ----------------------------------- |
| Storage     | Redis (same instance as OIDC store) |
| Key format  | `{prefix}tenantroles:{email}`       |
| Default TTL | 1 hour                              |
| Invalidated | On token refresh, on logout         |
| Pre-warmed  | At login (non-blocking)             |
| Cache miss  | Fetches from CSTAR on-demand        |

The TTL of 1 hour means roles are eventually consistent. If a user's CSTAR roles change, the change will be reflected within 1 hour (or immediately after the next token refresh / re-login).

## Known Role Names

These are the CSTAR shared-service role names used for n8n:

| Role Name        | Meaning                                  |
| ---------------- | ---------------------------------------- |
| `project:editor` | Can create/edit workflows in the tenant  |
| `project:viewer` | Can view workflows in the tenant         |
| `project:admin`  | Full administrative access to the tenant |

Additional roles may be added in CSTAR without requiring code changes — they will flow through automatically.

## File Locations

### Backend (`external-hooks`)

| File                                 | Purpose                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `src/api/services/tenant.service.ts` | `getTenantRolesForSession`, `prewarmTenantRoles`, `invalidateTenantRoles`, `fetchTenantRolesFromCstar`        |
| `src/api/helpers/tenant-roles.ts`    | Cache-aside resolution helper (Redis get/set/delete)                                                          |
| `src/api/helpers/ui-oidc-store.ts`   | Redis functions: `setUiTenantRoles`, `getUiTenantRoles`, `deleteUiTenantRoles`, `getUiOidcAccessTokenByEmail` |
| `src/api/helpers/ui-oidc.ts`         | Types: `UiResolvedSession`, `UiSessionSummary`, `WhoamiResponse` (include `tenantRoles`)                      |
| `src/api/helpers/ui-oidc-session.ts` | Calls `invalidateTenantRoles` on token refresh                                                                |
| `src/api/routes/ui-api.ts`           | Session resolution + login prewarm                                                                            |

### Frontend (`external-ui`)

| File                             | Purpose                                                  |
| -------------------------------- | -------------------------------------------------------- |
| `src/services/backend/auth.ts`   | `TenantRole` type, updated response types                |
| `src/state/session.ts`           | `useTenantRoles`, `useHasRole`, `useHasTenantRole` hooks |
| `src/auth/session-bootstrap.tsx` | Maps `tenantRoles` from API response to session state    |

## Configuration

No new environment variables are required. The feature uses:

| Variable            | Required For                                                    |
| ------------------- | --------------------------------------------------------------- |
| `CSTAR_BASE_URL`    | Fetching roles from CSTAR (if empty, tenant roles will be `[]`) |
| `UI_OIDC_REDIS_URL` | Caching (already required for session management)               |

## Edge Cases

| Scenario                          | Behavior                                           |
| --------------------------------- | -------------------------------------------------- |
| CSTAR not configured              | `tenantRoles` is always `[]`                       |
| CSTAR unreachable at login        | Prewarm fails silently; first session call retries |
| CSTAR unreachable at session time | Returns `[]` (no access token or fetch failure)    |
| User has no tenants               | `tenantRoles` is `[]`                              |
| User has tenants but no roles     | Tenant appears with `roles: []`                    |
| Redis unavailable                 | Falls through to CSTAR on every session call       |
| Role assigned after login         | Reflected after TTL expires or token refresh       |
