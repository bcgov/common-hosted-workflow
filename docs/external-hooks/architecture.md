# Backend Architecture

The external-hooks service follows a layered architecture with five distinct tiers. Each layer has a single responsibility and depends only on the layers below it.

```
┌─────────────────────────────────────────────────────┐
│  Routes & Controllers                               │
│  src/api/routes/                                    │
├─────────────────────────────────────────────────────┤
│  Middlewares                                        │
│  src/api/middlewares/                               │
├─────────────────────────────────────────────────────┤
│  Services                                           │
│  src/api/services/                                  │
├──────────────────────────┬──────────────────────────┤
│  n8n DB Repository       │  Custom DB Repository    │
│  src/db/repository/n8n/  │  src/db/repository/custom│
├──────────────────────────┴──────────────────────────┤
│  DB Schemas                                         │
│  src/db/schema/                                     │
└─────────────────────────────────────────────────────┘
```

---

## 1. DB Schema Layer

**Location:** `src/db/schema/`

Defines the project's own PostgreSQL tables using Drizzle ORM (`drizzle-orm/pg-core`). These tables exist alongside the n8n database tables but are managed independently.

### Tables

| Table                     | Purpose                                                                       |
| ------------------------- | ----------------------------------------------------------------------------- |
| `user_workflow`           | Maps users to workflows with a status and form progression                    |
| `tenant_project_relation` | Maps tenants (UUID) to n8n project IDs (composite PK)                         |
| `messages`                | In-app messages scoped to a project, with actor info and status               |
| `action_requests`         | Action requests with callback URLs, priority, due dates, and lifecycle status |
| `audit_log`               | Schema-only audit trail for messages and action requests                      |

### Conventions

- Every table has `created_at` / `updated_at` timestamps with automatic defaults.
- `actor_type` and `status` columns use CHECK constraints for allowed values.
- Partial indexes on frequently queried filtered sets (e.g., pending actions, active messages).
- Exported as Drizzle `InferSelectModel` / `InferInsertModel` types for type-safe queries.

---

## 2. n8n DB Repository Layer

**Location:** `src/db/repository/n8n/`

Adapter classes that wrap n8n's native TypeORM repositories. These provide a typed, safe interface over the n8n runtime's database layer without modifying n8n source code.

### Design

Each repository receives its corresponding n8n base repository via constructor (composition, not inheritance). Base repository interfaces are defined in `src/api/types/n8n-adapters.ts`.

```typescript
// Example: wrapping a base n8n repository
export class UserRepository {
  constructor(private readonly userRepository: BaseN8nUserRepository) {}
  get metadata() {
    return this.userRepository.metadata;
  }
  async findByEmail(email: string) {
    /* ... */
  }
}
```

### Repositories

| Class                        | Wraps                               | Key Methods                                                |
| ---------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `UserRepository`             | `BaseN8nUserRepository`             | `findByEmail`, `getUserForApiKey`                          |
| `ProjectRepository`          | `BaseN8nProjectRepository`          | `findOneBy`, `getPersonalProjectForUser`, `create`, `save` |
| `ProjectRelationRepository`  | `BaseN8nProjectRelationRepository`  | `findAllByUser`, `listUserEmailsByProjectIds`              |
| `WorkflowRepository`         | `BaseN8nWorkflowRepository`         | `findOneBy`                                                |
| `SharedWorkflowRepository`   | `BaseN8nSharedWorkflowRepository`   | `findProjectIds`, `findWorkflowRowsByProjectIds`           |
| `CredentialRepository`       | `BaseN8nCredentialRepository`       | `findOneBy`                                                |
| `SharedCredentialRepository` | `BaseN8nSharedCredentialRepository` | exposes `manager` for transactions                         |
| `ExecutionRepository`        | `BaseN8nExecutionRepository`        | `loadMetadataOrNull` (safe wrapper)                        |

### Patterns

- **Error absorption:** `ExecutionRepository.loadMetadataOrNull()` catches Postgres errors (e.g., malformed UUIDs) and returns `null` instead of throwing.
- **Dynamic SQL:** `SharedWorkflowRepository` and `ProjectRelationRepository` build raw SQL JOINs from entity metadata at runtime, avoiding hard-coded column names.
- **`sql.ts` utility:** Shared helpers `getColumnName(metadata, property)` and `quoteIdentifier(id)` for metadata-driven SQL generation.

---

## 3. Custom DB Repository Layer

**Location:** `src/db/repository/custom/`

Standalone repository classes that query the project's own PostgreSQL tables using Drizzle ORM. No relationship to n8n repositories.

### Repositories

| Class                             | Table                     | Key Methods                                                                            |
| --------------------------------- | ------------------------- | -------------------------------------------------------------------------------------- |
| `MessageRepository`               | `messages`                | `list`, `create`                                                                       |
| `ActionRequestRepository`         | `action_requests`         | `list`, `getById`, `create`, `updateStatus`                                            |
| `TenantProjectRelationRepository` | `tenant_project_relation` | `getProjectIdsByTenantId`, `getTenantIdByProjectId`, `listDistinctTenantIds`, `insert` |

### Patterns

- **Constructor injection:** Each receives a Drizzle `db` instance.
- **Composed WHERE clauses:** `list` methods accept an array of Drizzle conditions, composed by the caller.
- **Pagination:** `pagination.ts` provides `buildPaginationClauses` for cursor-based keyset pagination, and `nextCursorFromPagedItems` for generating the next page token.

---

## 4. Service Layer

**Location:** `src/api/services/`

Business logic and access control. Services compose both n8n repositories and custom repositories, enforcing tenant/project scoping on every operation.

### Services

| Service                    | Purpose                              | Dependencies                            |
| -------------------------- | ------------------------------------ | --------------------------------------- |
| `ActionService`            | CRUD for action requests             | `N8nRepositories`, `CustomRepositories` |
| `ChefsService`             | CHEFS form token exchange (external) | None (reads env vars)                   |
| `MessageService`           | CRUD for messages                    | `N8nRepositories`, `CustomRepositories` |
| `UiApiService`             | Facade for UI-facing operations      | `N8nRepositories`                       |
| `UiWorkflowQueryService`   | User context, workflow lists         | `N8nRepositories`                       |
| `UiWorkflowSharingService` | Share/unshare workflows              | `N8nRepositories`                       |
| `project-access.ts`        | Pure access-control functions        | Individual repositories                 |

### Access Control Pattern

Every mutation and query goes through project-scope validation:

1. **Resolve tenant projects:** `TenantProjectRelationRepository.getProjectIdsByTenantId(tenantId)`
2. **Resolve caller projects:** `listProjectIdsAccessibleToUser(projectRepo, projectRelationRepo, userId)`
3. **Intersect:** The intersection becomes `allowedProjectIds`
4. **Validate scope:** For operations tied to a workflow execution, `resolveWorkflowProjectScope` intersects the workflow's n8n projects with `allowedProjectIds`

### project-access.ts (Pure Functions)

| Function                              | Purpose                                           |
| ------------------------------------- | ------------------------------------------------- |
| `listProjectIdsAccessibleToUser`      | Union of personal + relation project IDs          |
| `verifyCallerHasN8nProjectAccess`     | Check relation or personal ownership              |
| `resolveWorkflowProjectScope`         | Intersect workflow projects with allowed projects |
| `validateN8nExecutionMatchesWorkflow` | Execution exists and matches claimed workflowId   |
| `validateN8nExecutionInTenantScope`   | Execution workflow intersects tenant scope        |
| `resolveProjectIdForCreate`           | Validate execution + pick a project for create    |
| `requireExecutionInTenantScope`       | Optional scope check for list filters             |
| `requireChwfAllowedProjectIds`        | Guard that scope was attached by middleware       |

---

## 5. Routes & Controllers Layer

**Location:** `src/api/routes/`

Express routers built via factory functions. Each `build*Router(context)` receives an `ApiRouteContext` bag and returns a configured `Router`.

### Route Context (`ApiRouteContext`)

The context bag is the dependency container passed to all route factories:

```typescript
type ApiRouteContext = {
  apiKeyAuthMiddleware: RequestHandler;
  adminAuthMiddleware: RequestHandler;
  workflowInteractionTenantMiddleware: RequestHandler;
  n8nRepositories: N8nRepositories;
  customRepositories: CustomRepositories;
  services: ApiServices;
};
```

### Route Files

| File          | Mount Path              | Endpoints                                                              |
| ------------- | ----------------------- | ---------------------------------------------------------------------- |
| `actions.ts`  | `/rest/custom/v1`       | CRUD for action requests                                               |
| `actors.ts`   | `/rest/custom/v1`       | Actor-scoped message/action queries                                    |
| `messages.ts` | `/rest/custom/v1`       | CRUD for messages                                                      |
| `admin.ts`    | `/rest/custom/v1/admin` | User projects, workflow/credential association, tenant-project mapping |
| `ui-api.ts`   | `/ui-api`               | Session, whoami, workflows, share/unshare                              |
| `oidc.ts`     | `/rest/auth/oidc`       | OIDC login/callback (SSO)                                              |

### Standard Middleware Stack

```
apiKeyAuthMiddleware → tenantMiddleware → Zod schema validation → handler
```

For admin routes: `adminAuthMiddleware` (includes API key check + role verification) replaces `apiKeyAuthMiddleware`.

### Async Error Handling

Route handlers should NOT use try/catch. There are two reasons:

1. **Centralized error middleware** — `handleErrorResponse` already handles all errors uniformly; duplicating that logic per-handler is pointless.
2. **Reduced codebase and nesting** — Removing try/catch eliminates boilerplate and keeps handlers flat and readable.

Existing routes (`/messages`, `/actions`, etc.) follow this pattern — no try/catch.

```typescript
// ✅ Correct — bare async handler
router.get('/resource', async (_req, res) => {
  const data = await services.domain.list();
  OkResponse(res, { data });
});

// ❌ Wrong — redundant try/catch
router.get('/resource', async (_req, res, next) => {
  try {
    const data = await services.domain.list();
    OkResponse(res, { data });
  } catch (error) {
    next(error);
  }
});
```

The only place `next(error)` is needed is inside **middleware** where you intentionally pass control to the error middleware.

### Response Format

All error responses use a standardized shape:

```json
{ "error": { "message": "Description", "details": [...] } }
```

Response helpers in `routes/responses/index.ts`: `BadRequestResponse`, `UnauthorizedResponse`, `ForbiddenResponse`, `NotFoundResponse`, `OkResponse`, `CreatedResponse`, `NoContentResponse`.

---

## 6. Middleware

**Location:** `src/api/middlewares/`

| Middleware                       | Purpose                                                        |
| -------------------------------- | -------------------------------------------------------------- |
| `auth.ts`                        | API key validation (`X-N8N-API-KEY` header) + admin role check |
| `workflow-interaction-tenant.ts` | Tenant ID validation + project scope intersection              |
| `oidc-jwt.ts`                    | Bearer token validation against remote JWKS                    |

### Communication via `res.locals`

Middleware communicates with route handlers through typed `res.locals`:

| Property                | Set By                 | Used By                          |
| ----------------------- | ---------------------- | -------------------------------- |
| `caller`                | `apiKeyAuthMiddleware` | All authenticated routes         |
| `chwfTenantId`          | `tenantMiddleware`     | Message/action routes            |
| `chwfAllowedProjectIds` | `tenantMiddleware`     | Message/action routes            |
| `chwfInternal`          | `tenantMiddleware`     | Create endpoints (internal auth) |
| `oidcToken`             | `oidcJwtMiddleware`    | OIDC-protected routes            |

Types are augmented in `src/api/types/express-context.d.ts`.

---

## 7. Bootstrap / Dependency Wiring

**Location:** `src/api/bootstrap/`

No DI framework. Dependencies are assembled in order via bootstrap functions:

```
Step 1: buildN8nRuntimeContext()
  └─ Gets raw TypeORM repos from n8n Container
  └─ Wraps each in adapter class → N8nRepositories

Step 2: buildCustomRepositories(databaseUrl)
  └─ Creates Drizzle instance
  └─ Instantiates custom repos → CustomRepositories

Step 3: buildApiServices(n8nRepositories, customRepositories)
  └─ Creates ActionService, MessageService, UiApiService → ApiServices

Step 4: buildRouteContext({ services, n8nRepositories, customRepositories, ... })
  └─ Creates auth middleware + tenant middleware
  └─ Returns complete ApiRouteContext

Step 5: Mount routers
  └─ mountCustomApi(app, routeContext)
  └─ mountUi(app, routeContext, ...)
  └─ mountOidc({ app, ... })
  └─ mountAssets(app, assetsPath)
  └─ applyOidcFrontendSettings(frontendSettings)
```

### Key Files

| File                     | Responsibility                                    |
| ------------------------ | ------------------------------------------------- |
| `n8n-repositories.ts`    | Step 1: wraps n8n TypeORM repos in typed adapters |
| `custom-repositories.ts` | Step 2: builds Drizzle-backed custom repos        |
| `services.ts`            | Step 3: creates service instances                 |
| `route-context.ts`       | Step 4: assembles middleware + context            |
| `custom-api.ts`          | Step 5a: mounts REST API routers                  |
| `ui.ts`                  | Step 5b: serves UI static files + UI API          |
| `oidc.ts`                | Step 5c: mounts OIDC auth routes                  |
| `assets.ts`              | Step 5d: serves static JS assets                  |
| `frontend-settings.ts`   | Patches n8n frontend config for OIDC              |

---

## 8. Type System

**Location:** `src/api/types/`

| File                   | Defines                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `n8n-adapters.ts`      | `Base*` interfaces for n8n TypeORM repos, `N8nRepositories` aggregate |
| `routes.ts`            | `ApiRouteContext`                                                     |
| `services.ts`          | `ApiServices`, `UiApiServiceContract`                                 |
| `repositories.ts`      | Re-exports `N8nRepositories`                                          |
| `auth.ts`              | `AuthMiddlewareConfig`                                                |
| `oidc.ts`              | `OidcTokenDetails`                                                    |
| `user.ts`              | `N8nUser`, `N8nRole`, `N8nScope`                                      |
| `ui-api.ts`            | `UiWorkflowSummary`, `UiApiContext`, `WorkflowRow`                    |
| `express-context.d.ts` | Express `Request`/`Locals` augmentation                               |

---

## 9. Testing

**Location:** `tests/`

- **Unit tests** per layer: repositories, services, middleware, routes.
- **Shared helpers** in `tests/helpers/`:
  - `mocks.ts`: Factory functions for mock repositories and contexts (`createMockN8nRepositories`, `createMockRouteContext`, etc.)
  - `test-utils.ts`: `getRouteHandlers`, `runHandlerChain`, `expectNextAppError`, `expectRejectsAppError`
- Tests import from `src/` directly (not from built output).
- Vitest with `vitest.config.mts` for path aliases.
