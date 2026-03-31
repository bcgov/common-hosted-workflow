# n8n custom admin API

Administrative endpoints exposed under **`/rest/custom/admin/*`**. They use n8n hooks (`external-hooks`) and require a **global owner** or **global admin** API key.

For **messages** and **action requests** (workflow interaction layer), see [`workflow-interaction-layer.md`](./workflow-interaction-layer.md) and [`workflow-interaction-api-validations.md`](./workflow-interaction-api-validations.md).

---

## Tenant–project relation (1:1)

The custom table **`tenant_project_relation`** is modeled as **one-to-one in both directions** for workflow interaction:

- **At most one `project_id` per `tenant_id`** — a tenant maps to a single n8n project for CHWF scoping.
- **At most one `tenant_id` per `project_id`** — a project cannot be linked to two different tenants (enforced by API and DB uniqueness on `project_id`).

Use **`POST /rest/custom/admin/tenant-project-relation`** to create that mapping before calling workflow interaction APIs. See endpoint **3** below for conflict responses when these rules are violated.

---

## Source layout (admin-related)

| Path                                      | Role                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `external-hooks/src/api/hooks.ts`         | n8n entry: `export = createHookConfig()`.                               |
| `external-hooks/src/api/route.ts`         | DI wiring, mounts `admin` router and workflow routers.                  |
| `external-hooks/src/api/middleware.ts`    | `createAuthMiddleware` (`apiKeyAuthMiddleware`, `adminAuthMiddleware`). |
| `external-hooks/src/api/admin.ts`         | Admin routes only.                                                      |
| `external-hooks/src/api/schemas/admin.ts` | Zod schemas for admin requests/responses.                               |

---

## Authentication

- **Header:** `X-N8N-API-KEY` (validated via n8n `PublicApiKeyService`).
- **Role:** Caller must have `global-owner` or `global-admin`; otherwise **403** `Global admin access required.`

---

## Endpoints

### 1. Get user project by email

- **URL:** `GET /rest/custom/admin/users/:email/project`
- **Path:** `email` — target user’s email.
- **200:** `{ "user": { … }, "project": { … } }` (personal project).
- **404:** User not found.

### 2. Associate workflow to project

- **URL:** `POST /rest/custom/admin/associate-workflow`
- **Body:** `{ "workflowId": "string", "projectId": "string", "singleOwner"?: boolean }`
- **Behavior:** Transaction; ensures workflow and project exist; creates/updates `SharedWorkflow` with owner role.
- **200:** `{ "success": true, "message": "…" }`
- **404:** Workflow or project not found.

### 3. Tenant–project relation

- **URL:** `POST /rest/custom/admin/tenant-project-relation`
- **Body:** `{ "tenantId": "uuid", "projectId": "string" }`
- **Purpose:** Inserts into `tenant_project_relation` so workflow interaction APIs can scope **`X-TENANT-ID`** to n8n projects. Enforces the **1:1** rules above; conflicts return **409** with `conflictProjectId` or `conflictTenantId`.
- **201:** New row inserted.
- **200:** Relation already existed.

---

## Internal dependencies (n8n)

| Piece           | Package / path                                           |
| --------------- | -------------------------------------------------------- |
| DI              | `@n8n/di`                                                |
| Repositories    | `@n8n/db` (e.g. User, Project, Workflow, SharedWorkflow) |
| API key service | n8n public API key service                               |

---

## ⚠️ Error handling

All admin routes use **`AppError`** and the global **`handleErrorResponse`** (`external-hooks/src/api/utils/errors.ts`). JSON shape:

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "…",
  "conflictProjectId": "…",
  "stack": "…"
}
```

`stack` is included only in development when configured.

| HTTP    | Typical cause                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------- |
| **400** | Invalid or failed Zod validation on params/body (e.g. bad `tenantId` format in handler checks).     |
| **401** | Missing/invalid `X-N8N-API-KEY` (via chained `apiKeyAuthMiddleware` inside `adminAuthMiddleware`).  |
| **403** | Authenticated user is not global owner/admin.                                                       |
| **404** | Target user, workflow, or project does not exist.                                                   |
| **409** | Tenant–project insert violates **1:1** mapping (`conflictProjectId` or `conflictTenantId` in body). |
| **500** | Unexpected errors (DB, misconfiguration); message is generic; details may be logged server-side.    |
