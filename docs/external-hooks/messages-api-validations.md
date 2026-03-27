# Messages APIs - Auth, AuthZ, and Pre-DB Validations (Single Source)

This document describes **every authentication, authorization, and request validation checkpoint** that occurs **before any custom DB calls** for the `messages` endpoints.

Applicable endpoints:

- `GET  /rest/custom/v1/messages/`
- `GET  /rest/custom/v1/actors/:actorId/messages`
- `POST /rest/custom/v1/messages/`

Code references (behavior):

- Auth + tenant scoping middleware: `external-hooks/src/api/middleware.ts`
- Routes + request validations: `external-hooks/src/api/workflow-interaction-layer/message.ts`
- Custom DB repository calls: `external-hooks/src/db/repository/workflow-interaction-layer/message.ts`

---

## Common middleware checkpoints (runs before all route handler logic)

Middleware chain for all message endpoints:

1. `apiKeyAuthMiddleware`
2. `createMessageTenantProjectMiddleware`
3. Route handler input validation (specific to each endpoint)

### 1) `apiKeyAuthMiddleware` (n8n auth)

Before any custom DB calls:

- Reads header `X-N8N-API-KEY`
  - If missing: returns `401 { "error": "No API key provided" }`
- Resolves caller using n8n `PublicApiKeyService.getUserForApiKey(token)`
  - If caller is missing or disabled: returns `401 { "error": "Invalid API key" }`
- On success sets `req.caller`

No custom DB actions happen in this middleware.

### 2) `createMessageTenantProjectMiddleware` (tenant + caller project scoping)

Before route handler runs any `messages` DB operations, the middleware:

#### 2.1 POST-only internal bearer enforcement

If the request is detected as `POST /rest/custom/v1/messages/`:

- Reads `Authorization` header and extracts bearer token via `extractBearerToken(...)`
- Reads env var `process.env.INTERNAL_AUTH_TOKEN`

Checks:

- If `INTERNAL_AUTH_TOKEN` env var is missing:
  - returns `500 { "error": "INTERNAL_AUTH_TOKEN not configured" }`
- If bearer token is missing or does not equal `INTERNAL_AUTH_TOKEN`:
  - returns `401 { "error": "Unauthorized" }`

If it is not POST, this internal bearer check is skipped.

#### 2.2 Caller existence check

- If `req.caller` is missing (defensive; should not happen if `apiKeyAuthMiddleware` succeeded):
  - returns `401 { "error": "Unauthorized" }`

#### 2.3 Tenant header validation (`X-TENANT-ID`)

- Reads header `X-TENANT-ID`
  - If missing: returns `400 { "error": "Missing X-TENANT-ID header" }`
- Validates UUID format via `TENANT_UUID_RE`
  - If invalid: returns `400 { "error": "Invalid X-TENANT-ID (expected UUID)" }`

#### 2.4 Tenant project resolution (custom DB read) + intersection (n8n scope)

Performs the actual scoping that becomes the input for the `messages` repository:

1. Tenant projects from custom DB:
   - calls `tenantProjectRelationRepository.getProjectIdsByTenantId(tenantId)`
   - if resulting list is empty: returns `403 { "error": "No projects linked to this tenant" }`
2. Caller-accessible projects from n8n:
   - calls `getAccessibleProjectIdsForUser(projectRepository, projectRelationRepository, callerId)`
   - includes:
     - caller’s personal project (if exists)
     - projects from project relations
3. Intersection check:
   - intersects tenantProjects with callerProjectIds
   - if intersection empty: returns `403 { "error": "User has no access to any project for this tenant" }`

On success, middleware sets:

- `req.chwfTenantId = tenantId`
- `req.chwfAllowedProjectIds = <intersection set>`

From this point onward, the route handler is allowed to query/insert `messages` using `req.chwfAllowedProjectIds`.

---

## Endpoint-specific validations (before custom DB calls)

### A) `GET /rest/custom/v1/messages/`

Route-level validations before `messageRepository.list`:

- `actorId` (optional query param)
  - If provided and not a non-empty string: returns `400 { "error": "Invalid actorId" }`
- `since` (optional query param; ISO-8601 datetime string)
  - If provided but not parseable into a valid `Date`: returns `400 { "error": "Invalid since" }`
- `limit` (optional query param)
  - If omitted: defaults to `50`
  - Parsed by `parsePositiveInteger(limit)`
  - Must be `1..200` (implemented as `> 200` rejection)
  - Otherwise: returns `400 { "error": "Invalid limit. Use integer between 1 and 200." }`

Custom DB call after validations:

- calls `messageRepository.list({ allowedProjectIds, actorId?, since?, limit })`
- repository query applies:
  - `messages.projectId IN allowedProjectIds`
  - optional `messages.actorId = actorId`
  - optional `messages.createdAt >= since`
  - orders by `messages.createdAt DESC`
  - applies `LIMIT`

No workflow/project mapping checks are done for this GET route.

---

### B) `GET /rest/custom/v1/actors/:actorId/messages`

Route-level validations before `messageRepository.list`:

- Path param `actorId`:
  - must be non-empty string (`validateNonEmpty(actorId)`)
  - otherwise: returns `400 { "error": "Invalid actorId" }`
- `since` (optional query param)
  - if provided but invalid datetime: returns `400 { "error": "Invalid since" }`
- `limit` (optional query param)
  - parsed with `parsePositiveInteger`
  - must be `<= 200`
  - otherwise: returns `400 { "error": "Invalid limit. Use integer between 1 and 200." }`

Custom DB call after validations:

- calls `messageRepository.list({ allowedProjectIds, actorId, since?, limit })`
- repository query applies:
  - `messages.projectId IN allowedProjectIds`
  - `messages.actorId = actorId`
  - optional `messages.createdAt >= since`
  - orders by `messages.createdAt DESC`
  - applies `LIMIT`

No workflow/project mapping checks are done for this GET actor route.

---

### C) `POST /rest/custom/v1/messages/`

Route-level payload parsing and validations before workflow/project resolution + insert:

#### C.1 Required fields (after trimming)

Handler reads and trims:

- `title`, `body`, `actorId`, `actorType`, `workflowInstanceId`, `workflowId`

If any required field is missing/empty:

- returns `400 { "error": "Invalid payload. Required fields: ..." }`

#### C.2 `actorType` constraint

`actorType` must be one of:

- `user`, `role`, `group`, `system`, `other`

Otherwise:

- returns `400 { "error": "Invalid actorType. Allowed: ..." }`

#### C.3 `status` constraint (optional)

If `status` is provided, it must be:

- `active` or `read`

Otherwise:

- returns `400 { "error": "Invalid status. Allowed: active, read" }`

#### C.4 Caller defensive check

- if `req.caller` is missing:
  - returns `401 { "error": "Unauthorized" }`

#### C.5 Workflow-to-project access validation (before insert)

This part runs after payload validations and before `messageRepository.create(...)`:

1. Allowed tenant/user scope input:
   - `allowedProjectIds` comes from middleware (`req.chwfAllowedProjectIds`)
   - if missing/empty: route would fail with `403` (middleware-bypass detection) in `projectScopeWhere`
2. Resolve workflow project mapping (n8n sharing metadata):
   - calls `sharedWorkflowRepository.findProjectIds(workflowId)`
3. Compute workflow-scoped projects:
   - intersects `findProjectIds(workflowId)` with `allowedProjectIds`
4. If intersection is empty:
   - returns `403 { "error": "workflowId is not accessible for this tenant/user scope" }`

#### C.6 Choose/validate final `projectId`

- Let `projectIdFromBody = payload.projectId` (optional)

If `projectIdFromBody` provided:

- must be inside the workflow-scoped intersection
- else: `403 { "error": "projectId is not accessible for this workflow/tenant/user scope" }`
- sets `projectId = projectIdFromBody`

If `projectIdFromBody` not provided:

- if intersection size is exactly 1:
  - sets `projectId` to the single entry
- if intersection size > 1:
  - returns `400 { "error": "Multiple projectIds are accessible for this workflow; provide projectId in payload" }`

#### C.7 Only after all above: custom DB insert

Then calls:

- `messageRepository.create({ title, body, actorId, actorType, workflowInstanceId, workflowId, projectId, metadata, status })`

---

## What this implies for “before DB actions”

For each message endpoint:

- `apiKeyAuthMiddleware`: no custom DB reads
- `createMessageTenantProjectMiddleware`: does the required custom DB reads to build `req.chwfAllowedProjectIds`
- GET endpoints: route handler validation happens next, then custom DB `SELECT`
- POST endpoint: route payload validations happen next, then additional workflow/project validations, then custom DB `INSERT`
