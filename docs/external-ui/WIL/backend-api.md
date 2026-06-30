# Backend API

This document covers the WIL backend endpoints, request validation, response shaping, and the callback proxy design.

## Router Overview

The WIL router is built by `buildWilRouter({ services, customRepositories })` and mounted at `/ui-api/wil/` behind the `requireUiRequestContext` middleware (OIDC session validation).

**File:** `external-hooks/src/api/routes/wil.ts`

## Endpoints

### GET /ui-api/wil/tenants

Returns available tenants for the logged-in user.

**Response:**

```json
{
  "tenants": [{ "id": "uuid", "name": "Tenant Display Name" }]
}
```

**Notes:** Currently resolves tenants from the `tenant_project_relation` table. TODO: Replace with CSTAR API integration for real tenant names and user-specific access.

---

### GET /ui-api/wil/actions

Returns tenant-scoped, actor-filtered action records with keyset pagination.

**Query Parameters:**

| Param    | Type               | Default | Description                                          |
| -------- | ------------------ | ------- | ---------------------------------------------------- |
| `limit`  | integer (1–200)    | 20      | Max records to return                                |
| `since`  | string             | —       | ISO datetime or keyset cursor (`ISO\|uuid`)          |
| `status` | string or string[] | —       | Filter by status (comma-separated or repeated param) |

**Required Headers:**

- `Authorization: Bearer <token>`
- `X-TENANT-ID: <uuid>`

**Response Shape:**

```json
{
  "data": [
    {
      "id": "uuid",
      "actionType": "showform",
      "payload": { "formId": "...", "formName": "..." },
      "actorId": "user@gov.bc.ca",
      "status": "pending",
      "priority": "normal",
      "dueDate": null,
      "createdAt": "2025-06-10T14:30:00.000Z",
      "updatedAt": "2025-06-10T14:30:00.000Z"
    }
  ],
  "nextCursor": "2025-06-10T14:30:00.000Z|uuid-of-last-item"
}
```

**Excluded fields** (never returned to browser):

- `callbackUrl`, `callbackMethod`, `callbackPayloadSpec`
- `metadata`, `workflowInstanceId`, `workflowId`, `projectId`
- `actorType`, `checkIn`
- `payload.formApiKey` (case-insensitive match, stripped for `showform` actions)

---

### GET /ui-api/wil/messages

Returns tenant-scoped, actor-filtered message records with keyset pagination.

**Query Parameters:** Same as `/actions` (except no `status` filter).

**Response Shape:**

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Notification title",
      "body": "Message body content",
      "actorId": "user@gov.bc.ca",
      "createdAt": "2025-06-10T14:30:00.000Z",
      "updatedAt": "2025-06-10T14:30:00.000Z",
      "status": "active"
    }
  ],
  "nextCursor": null
}
```

---

### POST /ui-api/wil/chefs-token

Exchanges a FormAPIKey (stored in the action record) for a short-lived CHEFS JWT.

**Request Body:**

```json
{ "actionId": "uuid-of-showform-action" }
```

**Response:**

```json
{
  "authToken": "eyJhbG...",
  "formId": "chefs-form-uuid",
  "formName": "My Form",
  "baseUrl": "https://submit.digital.gov.bc.ca/app"
}
```

**Error Responses:**

| Condition                       | Status | Message                       |
| ------------------------------- | ------ | ----------------------------- |
| Missing/empty `actionId`        | 400    | "actionId is required"        |
| Action not found                | 404    | "Action not found"            |
| `actionType` ≠ `showform`       | 400    | "Invalid action type"         |
| Missing `formApiKey` in payload | 400    | "Missing formApiKey"          |
| Missing `formId` in payload     | 400    | "Missing formId"              |
| CHEFS Gateway exchange failure  | 502    | "CHEFS token exchange failed" |

**Implementation Details:**

1. Validates request body via Zod schema
2. Resolves tenant → project IDs
3. Fetches action via `ActionService.getById({ allowedProjectIds, actionId, actorMatchers })`
4. Verifies `actionType === 'showform'`
5. Extracts `formApiKey` and `formId` from payload
6. Calls `ChefsService.getFormToken({ formId, formApiKey })`
   - POSTs to `{CHEFS_GATEWAY_URL}/auth/token/forms/{formId}` with Basic Auth
   - Returns `{ authToken, formId, baseUrl }`

---

### POST /ui-api/wil/callback

Proxies interaction responses to the upstream webhook URL stored in the action record.

**Request Body:**

```json
{
  "actionId": "uuid-of-action",
  "body": { "option": "Approve" }
}
```

**Response (success):**

```json
{ "success": true, "message": "Action completed" }
```

**Behavior:**

```
1. Validate request body (Zod)
2. Resolve tenant → project IDs
3. Fetch action record (includes callbackUrl, callbackMethod)
4. Decision:
   ├── callbackMethod === 'NONE' OR callbackUrl is empty
   │   └── Update status to 'completed', return success
   │
   └── Otherwise
       ├── Forward body to callbackUrl with specified HTTP method
       │   └── Timeout: 30 seconds
       │
       ├── Upstream 2xx
       │   ├── Update action status to 'completed'
       │   └── Return success
       │
       └── Upstream non-2xx or timeout
           ├── DO NOT update status
           └── Return upstream error to caller
```

**Error Responses:**

| Condition                 | Status          | Message                       |
| ------------------------- | --------------- | ----------------------------- |
| Missing/empty `actionId`  | 400             | "actionId is required"        |
| Action not found          | 404             | "Action not found"            |
| Upstream returns non-2xx  | Upstream status | Upstream error body forwarded |
| Upstream timeout (30s)    | 504             | "Upstream timeout"            |
| Network error to upstream | 502             | "Upstream request failed"     |

**Important:** If the status update fails _after_ a successful upstream call, the endpoint still returns success to the caller. The user completed their interaction — the status will be eventually consistent.

## Request Validation

All POST endpoints use Zod schemas with a `createRequestParser` middleware:

**File:** `external-hooks/src/api/schemas/wil.ts`

```typescript
// POST /callback
export const wilCallbackSchema = z.object({
  body: z.object({
    actionId: z.string().min(1, 'actionId is required'),
    body: z.record(z.string(), z.unknown()),
  }),
});

// POST /chefs-token
export const wilChefsTokenSchema = z.object({
  body: z.object({
    actionId: z.string().min(1, 'actionId is required'),
  }),
});

// GET /actions and /messages
export const wilListQuerySchema = z.object({
  query: z.object({
    limit: z.string().optional().transform(/* parse + clamp */),
    since: z.string().optional().transform(/* parse cursor or ISO */),
    status: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform(/* validate */),
  }),
});
```

The `createRequestParser` middleware:

1. Parses the request against the schema
2. Attaches validated/transformed values to `req.parsed`
3. Returns 400 with validation errors on failure

## Tenant Resolution

**File:** `external-hooks/src/api/routes/helpers/wil-tenant.ts`

```typescript
export async function resolveWilTenantProjectIds(req, tenantProjectRelationRepo): Promise<string[]>;
```

1. Extract `X-TENANT-ID` header
2. Validate UUID format (`/^[0-9a-f]{8}-...-[0-9a-f]{12}$/i`)
3. Query `tenant_project_relation` table for project IDs
4. If no projects found → throw 403
5. Return project IDs array

All subsequent service calls use these project IDs as `allowedProjectIds` to enforce tenant isolation.

## Actor Resolution

**File:** `external-hooks/src/api/routes/helpers/wil-actor.ts`

```typescript
export function resolveActorMatchers(session: UiResolvedSession, tenantId: string): ActorMatchers {
  const tenantRoleEntry = session.tenantRoles.find((tr) => tr.tenantId === tenantId);
  const tenantGroupEntry = session.tenantGroups.find((tg) => tg.tenantId === tenantId);

  return {
    userId: session.email,
    userFallback: session.subject,
    roleNames: tenantRoleEntry?.roles ?? [],
    groupNames: tenantGroupEntry?.groups ?? [],
  };
}
```

**Type:**

```typescript
type ActorMatchers = {
  userId: string; // user's email — matches actor_type = 'user'
  userFallback: string; // Keycloak subject — legacy fallback for actor_type = 'user'
  roleNames: string[]; // CSTAR role names — matches actor_type = 'role'
  groupNames: string[]; // CSTAR group names — matches actor_type = 'group'
};
```

`resolveActorMatchers` takes the current `tenantId` from the `X-TENANT-ID` header so it can look up the correct role and group entries for that specific tenant.

### OR-Based Query

The `actorMatchers` are passed to `buildActorMatcherClause` in both `ActionService` and `MessageService`, which generates a single OR clause:

```sql
(actor_type = 'user' AND actor_id IN ('user@example.com', 'oidc-subject'))
OR (actor_type = 'role' AND actor_id IN ('project:editor', 'ui:actor'))
OR (actor_type = 'group' AND actor_id IN ('UI Actor', 'Ministry Editors'))
```

This means a workflow can assign an action or message to:

- A **specific user** by email or OIDC subject
- A **role** (e.g. `project:editor`) — visible to all users holding that role in the tenant
- A **group** (e.g. `UI Actor`) — visible to all members of that group in the tenant

The role and group clauses are omitted from the query when the user has no roles or groups in the tenant (avoids empty `IN` lists).

## Response Shaping

**File:** `external-hooks/src/api/routes/helpers/wil-response.ts`

### mapActionToUiResponse

Strips sensitive fields and removes `formApiKey` from showform payloads:

```typescript
export function mapActionToUiResponse(action: ActionRequest): UiActionResponse {
  const payload = { ...(action.payload as Record<string, unknown>) };

  if (action.actionType === 'showform') {
    for (const key of Object.keys(payload)) {
      if (key.toLowerCase() === 'formapikey') {
        delete payload[key];
      }
    }
  }

  return {
    id: action.id,
    actionType: action.actionType,
    payload,
    actorId: action.actorId,
    status: action.status,
    priority: action.priority,
    dueDate: action.dueDate,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
  };
}
```

### formatListResponse

Adds keyset pagination cursor when the page is full:

```typescript
export function formatListResponse<T extends { createdAt: Date; id: string }>(
  items: T[],
  limit: number,
): { data: T[]; nextCursor: string | null } {
  const last = items.at(-1);
  if (items.length === limit && last) {
    return { data: items, nextCursor: `${last.createdAt.toISOString()}|${last.id}` };
  }
  return { data: items, nextCursor: null };
}
```

Cursor format: `{ISO-8601-datetime}|{uuid}` — allows deterministic pagination even with identical timestamps.

## Keyset Pagination

The `since` query parameter supports two modes:

### Time-based (plain ISO datetime)

```
GET /ui-api/wil/actions?since=2025-06-01T00:00:00.000Z
```

Returns records with `createdAt >= since`. Used for date-range filtering.

### Cursor-based (ISO + pipe + UUID)

```
GET /ui-api/wil/actions?since=2025-06-10T14:30:00.000Z|550e8400-e29b-41d4-a716-446655440000
```

Returns records _after_ the identified row in descending order. Used for "Load More" pagination.

The backend query uses a composite condition:

```sql
WHERE (created_at < cursor_time)
   OR (created_at = cursor_time AND id < cursor_id)
ORDER BY created_at DESC, id DESC
```

## Error Handling

All WIL route handlers use `AppError` for known error conditions. The existing `handleErrorResponse` middleware catches these and returns structured JSON:

```json
{
  "error": {
    "message": "Human-readable error message",
    "statusCode": 400
  }
}
```

| Error Source                 | Behavior                            |
| ---------------------------- | ----------------------------------- |
| Zod validation failure       | 400 with field-level errors         |
| `AppError` thrown in handler | Corresponding HTTP status + message |
| Unhandled error              | 500 Internal Server Error           |

Upstream callback errors (non-2xx) are forwarded with the upstream status code and body, allowing the frontend to display specific error messages from the n8n webhook.

## CHEFS Service

**File:** `external-hooks/src/api/services/chefs.service.ts`

Handles the CHEFS Gateway token exchange:

```typescript
export class ChefsService {
  private readonly gatewayUrl: string; // from CHEFS_GATEWAY_URL env var
  private readonly baseUrl: string; // gatewayUrl without /gateway/v1

  async getFormToken({ formId, formApiKey }): Promise<GetFormTokenResult> {
    // POST to {gatewayUrl}/auth/token/forms/{formId}
    // with Basic Auth: base64(formId:formApiKey)
    // Returns: { authToken, formId, baseUrl }
  }
}
```

The `baseUrl` is computed by stripping the gateway path suffix. This URL is returned to the frontend for the `<chefs-form-viewer>` to use as its API base.
