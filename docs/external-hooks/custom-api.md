# n8n custom API endpoints

A set of **custom administrative API endpoints** for n8n by leveraging internal hooks. These endpoints extend n8n's native capabilities, specifically allowing for cross-user project lookups and manual workflow-to-project associations.

### Source layout (`external-hooks/src/api/`)

| File                | Role                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`hooks.ts`**      | n8n external-hooks **entry** (`export = createHookConfig()`). Build output: `dist/api/hooks.cjs` (see `EXTERNAL_HOOK_FILES` in the main `Dockerfile`). |
| **`middleware.ts`** | Shared code: constants, `createAuthMiddleware`, and `adminAuthMiddleware` wiring.                                                                      |
| **`admin.ts`**      | `/rest/custom/admin/*` routes only.                                                                                                                    |
| **Message APIs**    | Documented separately in [`workflow-interaction-layer.md`](./workflow-interaction-layer.md).                                                           |

---

## 🔐 Authentication & Security

- **Admin routes** (`/rest/custom/admin/*`) use `adminAuthMiddleware`: validates `X-N8N-API-KEY` via n8n’s `PublicApiKeyService` and requires `global-owner` or `global-admin`.
- **Headers:** `X-N8N-API-KEY` required for admin routes.
- **Mechanism:** The middleware validates the key against n8n's internal `PublicApiKeyService`. If the user is not an administrator, the request returns a `403 Forbidden` status.

---

## 🚀 API Endpoints

### 1. Get User Project Details

Retrieves the user profile and the unique ID of their personal project based on their email address.

- **URL:** `/rest/custom/admin/users/:email/project`
- **Method:** `GET`
- **Path Parameters:**
- `email` (string): The email address of the target user.

- **Success Response (200 OK):**

```json
{
  "user": { "id": "uuid", "email": "user@example.com", ... },
  "project": { "id": "uuid", "name": "User's Project", "type": "personal" }
}

```

### 2. Associate Workflow to Project

Manually creates a shared relationship between a specific workflow and a project. This effectively "moves" or "shares" a workflow into a project's scope with `owner` permissions.

- **URL:** `/rest/custom/admin/associate-workflow`
- **Method:** `POST`
- **Request Body:**

```json
{
  "workflowId": "string",
  "projectId": "string"
}
```

- **Logic:**

1. Validates that both the `workflowId` and `projectId` exist in the database.
2. Uses a database transaction via `withTransaction` to ensure data integrity.
3. Creates a new entry in the `SharedWorkflowRepository` with the role `workflow:owner`.

- **Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Workflow 'ID' successfully associated with project 'ID'"
}
```

### 3. Insert Tenant Project Relation

Inserts a mapping into the custom table `tenant_project_relation` so message APIs can validate `X-TENANT-ID` against the allowed projects for that tenant. At most **one project per tenant**: if the tenant already has a mapping to a different `projectId`, the API returns `409` with `conflictProjectId` (the existing project id).

- **URL:** `/rest/custom/admin/tenant-project-relation`
- **Method:** `POST`
- **Request Body:**

```json
{
  "tenantId": "uuid",
  "projectId": "string"
}
```

- **Success (201 Created):**

```json
{ "success": true, "message": "Inserted tenant/project relation ..." }
```

- **Conflict (409):**
  - If the tenant already has a project mapping and the request uses a different `projectId`: `409` with `conflictProjectId`.
  - If the `projectId` is already mapped to a different tenant: `409` with `conflictTenantId`.

### Workflow interaction layer (message APIs)

See [`workflow-interaction-layer.md`](./workflow-interaction-layer.md).

## 🛠 Internal Dependencies

The script relies on access to n8n's internal Node.js modules. If you are moving this to a different environment, ensure these paths remain valid:

| Module / Service | Path Location                                       |
| ---------------- | --------------------------------------------------- |
| **DI Container** | `@n8n/di`                                           |
| **Repositories** | `@n8n/db` (User, Project, Workflow, SharedWorkflow) |
| **Auth Service** | `dist/services/public-api-key.service.js`           |

---

## ⚠️ Error Handling

The implementation uses standard HTTP status codes for error reporting:

- `400 Bad Request`: Missing required fields in the POST body.
- `401 Unauthorized`: No API key provided or key is invalid.
- `403 Forbidden`: User is authenticated but lacks Admin/Owner privileges.
- `404 Not Found`: The requested User, Workflow, or Project does not exist.
- `500 Internal Server Error`: Generic database or runtime failures (logged with stack trace in debug mode).
