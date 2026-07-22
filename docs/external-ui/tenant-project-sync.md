# Tenant Project Sync

Automatic provisioning of n8n team projects from CSTAR tenants at user login.

## Overview

When a user logs in via OIDC (either through n8n's native login or the external UI), the system synchronizes their CSTAR tenant memberships with n8n team projects. This ensures users automatically gain access to the correct team projects based on their roles in CSTAR, without requiring manual project setup or user invitation.

## Architecture

```
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│   OIDC Login Flow    │      │  TenantProjectSync   │      │     CSTAR API        │
│  (oidc.ts / ui-api)  │─────▶│      Service         │─────▶│  /users/{id}/tenants │
│                      │      │                      │      │  /tenants/{id}/...   │
└──────────────────────┘      └──────────┬───────────┘      └──────────────────────┘
                                         │
                              ┌──────────▼───────────┐
                              │     n8n Database      │
                              │  - project            │
                              │  - project_relation   │
                              │  - tenant_project_rel │
                              └──────────────────────┘
```

## Trigger Points

The sync is invoked from two login paths:

1. **n8n OIDC callback** (`src/api/routes/oidc.ts`) — triggered when a user completes the native n8n OIDC login flow.
2. **External UI callback** (`src/api/routes/ui-api.ts` → `/auth/callback`) — triggered when a user logs in through the external UI.

Both invoke the sync **non-blocking** (fire-and-forget). If the sync fails, the login succeeds normally — errors are logged but never surface to the user.

## Data Flow

### Step 1: Resolve CSTAR User Identity

The user's CSTAR SSO user ID is resolved from OIDC claims in priority order:

1. `idir_user_guid` (IDIR users)
2. `bceid_user_guid` (BCeID users)
3. Keycloak `subject`
4. Email (last resort)

This logic lives in `src/api/helpers/cstar-sso-user-id.ts`.

### Step 2: Fetch User's Tenants

Calls CSTAR API: `GET /api/v1/users/{ssoUserId}/tenants`

Returns all tenants the user belongs to. Each tenant has an `id` and `name`.

### Step 3: For Each Tenant (Concurrently)

All tenants are processed in parallel via `Promise.allSettled()`. Each tenant sync is independent — one failure does not block others.

> **Note:** If CSTAR returns zero tenants, this step is skipped entirely and the flow proceeds directly to Step 4 (reconciliation).

#### 3a. Fetch Shared Service Roles

Calls CSTAR API: `GET /api/v1/tenants/{tenantId}/ssousers/{ssoUserId}/shared-service-roles`

Returns the user's assigned roles for that tenant's shared service (n8n).

#### 3b. Resolve n8n Project Role

Maps CSTAR role names to n8n project roles using a priority hierarchy:

| CSTAR Role Name  | n8n Project Role   | Priority |
| ---------------- | ------------------ | -------- |
| `project:editor` | `project:editor`   | Highest  |
| `project:viewer` | `project:viewer`   | Lower    |
| (anything else)  | `null` (no access) | —        |

Only the highest-priority matching role is applied.

#### 3c. Ensure Team Project Exists

Checks if a team project is already mapped to this tenant via the `tenant_project_relation` table.

- **Project exists** → proceed to user relation sync.
- **Project does NOT exist + user has a qualifying role** → create the project.
- **Project does NOT exist + user has NO qualifying role** → skip (don't create empty projects).

#### 3d. Create Team Project (if needed)

When creating a new team project:

1. Creates an n8n project with `type: 'team'`, `name: <tenant name>`, `creatorId: <global owner>`
2. Links the global owner as `project:admin`
3. Inserts a `tenant_project_relation` record mapping `tenantId → projectId`

The tenant mapping insert uses `onConflictDoNothing` to gracefully handle race conditions when two users from the same tenant log in simultaneously.

#### 3e. Sync User Project Relation

Determines what action to take based on the user's current relation vs. resolved role:

| Current State                              | Resolved Role                        | Action                     |
| ------------------------------------------ | ------------------------------------ | -------------------------- |
| No relation                                | `project:editor` or `project:viewer` | **Add** relation           |
| `project:viewer`                           | `project:editor`                     | **Update** (promote)       |
| `project:editor`                           | `project:viewer`                     | **Update** (demote)        |
| `project:editor` or `project:viewer`       | Same role                            | **No-op**                  |
| `project:editor` or `project:viewer`       | `null`                               | **Remove** relation        |
| `project:admin` (global owner)             | Any                                  | **Skip** (never modify)    |
| Non-managed role (e.g., manually assigned) | Any                                  | **Skip** (don't overwrite) |

The service only manages roles it owns (`project:editor`, `project:viewer`). If a user was manually assigned a different role (e.g., `project:admin`), the sync will not modify it.

### Step 4: Reconcile Stale Tenant Project Relations

After processing active tenants (or immediately if CSTAR returned zero tenants), a reconciliation pass runs to remove the user from any tenant projects they no longer belong to.

The `removeStaleTenantProjectRelations` method:

1. Fetches all the user's project relations from n8n (with role eagerly loaded)
2. Skips the user's personal project
3. For each remaining project, checks if it has a `tenant_project_relation` mapping
4. If the mapped tenant is **not** in the active CSTAR tenant list → removes the user's relation (if it's a managed role)

This handles two scenarios:

- **User removed from all tenants** — active set is empty, so all managed team project relations are removed
- **User removed from specific tenants** — only relations for missing tenants are removed; active tenants are preserved

| Condition                                         | Result                                        |
| ------------------------------------------------- | --------------------------------------------- |
| Tenant still in CSTAR list                        | Relation preserved (already synced in Step 3) |
| Tenant no longer in CSTAR list + managed role     | **Relation removed**                          |
| Tenant no longer in CSTAR list + non-managed role | Relation preserved                            |
| Personal project                                  | Always preserved                              |
| Global owner `project:admin`                      | Always preserved                              |

## Configuration

| Environment Variable                               | Default | Description                                      |
| -------------------------------------------------- | ------- | ------------------------------------------------ |
| `FEATURES_ENABLED` (include `tenant-project-sync`) | `""`    | Feature flag to enable/disable the sync entirely |
| `CSTAR_BASE_URL`                                   | `""`    | CSTAR API base URL. If empty, sync is skipped    |

Both must be set for the sync to function. The sync also requires a valid global owner user in the n8n database (resolved at startup).

## Database Schema

### `tenant_project_relation` (custom table)

Maps CSTAR tenants to n8n team projects.

| Column       | Type          | Constraint                   |
| ------------ | ------------- | ---------------------------- |
| `tenant_id`  | `uuid`        | PK (composite)               |
| `project_id` | `varchar(50)` | PK (composite), unique index |

- Composite primary key on `(tenant_id, project_id)`
- Unique index on `project_id` — each n8n project maps to at most one tenant
- Index on `tenant_id` — fast lookup by tenant

### n8n core tables used

- `project` — team project records
- `project_relation` — user-to-project role mappings

## Safety Mechanisms

1. **Feature flag** — removing `tenant-project-sync` from `FEATURES_ENABLED` disables all sync logic instantly.
2. **Non-blocking execution** — sync failures never block or fail user login.
3. **Global owner protection** — the global owner's `project:admin` relation is never modified.
4. **Managed role guard** — only roles assigned by the sync (`project:editor`, `project:viewer`) are updated or removed. Manually assigned roles are left untouched.
5. **Race condition handling** — concurrent logins use `INSERT ... ON CONFLICT DO NOTHING` for the tenant mapping to prevent duplicate constraint violations.
6. **Empty owner guard** — if no global owner user exists at startup, sync is skipped entirely with a warning (prevents corrupt data).
7. **Graceful CSTAR failures** — if CSTAR API is unreachable or returns errors, individual tenant syncs fail independently without affecting other tenants.
8. **Stale relation reconciliation** — after every sync, stale project relations (for tenants no longer in CSTAR) are removed. Only managed roles are affected; personal projects and non-managed roles are always preserved.

## Service Dependencies

```
TenantProjectSyncService
├── CstarService              (fetches tenants & roles from CSTAR API)
├── N8nRepositories
│   ├── project               (create/save team projects)
│   └── projectRelation       (find/save/delete user-project relations)
├── CustomRepositories
│   └── tenantProjectRelation (tenant-to-project mapping CRUD)
└── globalOwnerUserId         (resolved once at startup from DB)
```

## File Locations

| File                                                  | Purpose                                           |
| ----------------------------------------------------- | ------------------------------------------------- |
| `src/api/services/tenant-project-sync.service.ts`     | Core sync logic                                   |
| `src/api/services/cstar.service.ts`                   | CSTAR API client                                  |
| `src/api/helpers/cstar-sso-user-id.ts`                | SSO user ID resolution from OIDC claims           |
| `src/api/constants/project-roles.ts`                  | Role constants and type guards                    |
| `src/db/repository/custom/tenant-project-relation.ts` | Drizzle repository for tenant mapping             |
| `src/api/bootstrap/services.ts`                       | Service instantiation and global owner resolution |
| `src/config.ts`                                       | Environment variable definitions                  |

## Sequence Diagram

```
User Login ─────────▶ OIDC Callback
                           │
                           ▼
                    Resolve SSO User ID
                           │
                           ▼
              syncTenantsForUser() [non-blocking]
                           │
                           ▼
               ┌── getUserTenants() ──▶ CSTAR API
               │
               ▼
         If tenants > 0, for each tenant (parallel):
               │
               ├── getUserSharedServiceRoles() ──▶ CSTAR API
               │
               ├── resolveProjectRole()
               │        editor > viewer > null
               │
               ├── getExistingProjectIdForTenant()
               │        │
               │        ├─ Found? ──▶ syncUserProjectRelation()
               │        │
               │        └─ Not found + has role? ──▶ createTenantProject()
               │                                         │
               │                                         ▼
               │                                  syncUserProjectRelation()
               │
               └── Done (logged, errors caught per-tenant)
                           │
                           ▼
         removeStaleTenantProjectRelations()
               │
               ├── findAllByUser() (with role loaded)
               │
               ├── For each non-personal, tenant-mapped project:
               │        │
               │        ├─ Tenant in active list? ──▶ Skip
               │        │
               │        └─ Tenant NOT in list + managed role? ──▶ Delete relation
               │
               └── Done
```

## Local Development

In local docker-compose, the CSTAR API is mocked by the `sdg-mock-app` service:

```env
CSTAR_BASE_URL=http://host.docker.internal:8081
# tenant-project-sync is controlled via FEATURES_ENABLED (include "tenant-project-sync" in the comma-separated list)
```

The mock service returns static tenant and role data from `docker-compose/sdg-mock-app/src/app/api/v1/mock-data.json`.

## Deployed Environments

| Environment        | CSTAR_BASE_URL                                                 |
| ------------------ | -------------------------------------------------------------- |
| dev (gold/golddr)  | `https://dev.connect.digital.gov.bc.ca` (currently using mock) |
| test (gold/golddr) | `https://test.connect.digital.gov.bc.ca`                       |
| prod (gold/golddr) | `https://connect.digital.gov.bc.ca`                            |
