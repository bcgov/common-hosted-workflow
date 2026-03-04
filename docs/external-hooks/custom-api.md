# n8n custom API endpoints

A set of **custom administrative API endpoints** for n8n by leveraging internal hooks. These endpoints extend n8n's native capabilities, specifically allowing for cross-user project lookups and manual workflow-to-project associations.

---

## 🔐 Authentication & Security

All custom endpoints are protected by the `adminAuthMiddleware`.

- **Header Required:** `X-N8N-API-KEY`
- **Permission Level:** Requires a user with the `global-owner` or `global-admin` role.
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
