# Workflow interaction layer — headers and n8n validations

This document describes **required headers**, **tenant middleware**, and **n8n-backed checks** (execution id, workflow–project scope) that apply before or alongside handlers for **messages** and **action request** APIs.

**Endpoint catalog** (paths, query/body summaries): [`workflow-interaction-layer.md`](./workflow-interaction-layer.md).

**Admin APIs** (tenant–project setup, **1:1** mapping): [`custom-api.md`](./custom-api.md).

---

## Prerequisite

Before any workflow interaction call succeeds, the tenant must have a row in **`tenant_project_relation`** (exactly **one project per tenant**, **one tenant per project** — see `custom-api.md`), the API key user must have access to that **`project_id`**, and POST creates need **`INTERNAL_AUTH_TOKEN`**. Create the mapping with **`POST /rest/custom/admin/tenant-project-relation`**.

---

## Code map

| Concern                            | Location                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| API key + tenant middleware        | `external-hooks/src/api/middleware.ts` — `apiKeyAuthMiddleware`, `createWorkflowInteractionTenantMiddleware` |
| n8n project list + execution scope | `external-hooks/src/api/helpers/n8n-validation.ts`                                                           |
| Route-level scope read             | `requireChwfAllowedProjectIds` in `n8n-validation.ts` (uses `res.locals.chwfAllowedProjectIds`)              |
| Internal POST path detection       | `external-hooks/src/api/constants/route-patterns.ts` — `workflowInteractionInternalPostPathPattern`          |
| Central errors                     | `external-hooks/src/api/utils/errors.ts`                                                                     |

---

## Header and middleware chain

Order for every workflow interaction route:

1. **`apiKeyAuthMiddleware`**
2. **`createWorkflowInteractionTenantMiddleware`** (same instance for messages and actions)
3. Zod request validation (`createRequestSchemaValidator` + handler)

### 1) `X-N8N-API-KEY`

- Required.
- Resolved via n8n `PublicApiKeyService`; result stored in **`res.locals.caller`**.
- Missing/invalid → **401** (`AppError`).

### 2) Tenant + caller project scope (`createWorkflowInteractionTenantMiddleware`)

- **`X-TENANT-ID`** required; must match UUID rules used in code.
- Loads project IDs for the tenant from **`tenant_project_relation`**.
- Loads the caller’s accessible n8n project IDs via **`listN8nProjectIdsAccessibleToUser`** (personal project + project relations).
- Intersects the two sets; stores **`res.locals.chwfAllowedProjectIds`** and **`res.locals.chwfTenantId`**.
- Typical failures: **400** (missing/invalid tenant header), **403** (no tenant projects or empty intersection).

### 3) Internal bearer (POST create only)

For paths matching **`workflowInteractionInternalPostPathPattern`**:

- `POST /rest/custom/v1/messages/` (with optional trailing slash)
- `POST /rest/custom/v1/actions` (with optional trailing slash)

Requires:

- Env **`INTERNAL_AUTH_TOKEN`** set.
- Header **`Authorization: Bearer <INTERNAL_AUTH_TOKEN>`**.

Failures: **500** if env missing, **401** if bearer missing or wrong.

`res.locals.chwfInternal` is set from whether the bearer matched.

---

## n8n validation helpers (`n8n-validation.ts`)

| Function                              | When used                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `listN8nProjectIdsAccessibleToUser`   | Inside tenant middleware (caller’s n8n projects).                                                                                   |
| `verifyCallerHasN8nProjectAccess`     | Optional reuse for single-project checks.                                                                                           |
| `requireChwfAllowedProjectIds`        | Start of each handler: ensures middleware set `chwfAllowedProjectIds`; else **403**.                                                |
| `resolveWorkflowProjectScope`         | Intersects `SharedWorkflowRepository.findProjectIds(workflowId)` with `chwfAllowedProjectIds`.                                      |
| `validateN8nExecutionMatchesWorkflow` | **POST** create (messages/actions): execution exists and `execution.workflowId` equals body `workflowId`.                           |
| `validateN8nExecutionInTenantScope`   | **GET** lists when query **`workflowInstanceId`** is present: execution exists and its workflow intersects `chwfAllowedProjectIds`. |

**`N8nExecutionLookup`:** minimal type for n8n `ExecutionRepository.findSingleExecution`.

Typical validation outcomes from these helpers:

- Unknown or invalid execution id → **400** `Invalid workflowInstanceId`.
- Execution `workflowId` ≠ body `workflowId` (POST) → **400** `workflowInstanceId does not match workflowId`.
- Workflow/instance not overlapping allowed projects → **403** with scoped error message.

---

## Zod and response validation

- Request bodies and queries: **`schemas/message.ts`**, **`schemas/action-request.ts`**. Failures → **400** with a summarized message.
- Handler outputs checked with **`parseValidatedResponse`**: contract drift → **500** with a response-validation message.

---

## Enum constants (API)

Shared string unions live in **`external-hooks/src/api/constants/enum.ts`** and are referenced from the Zod schemas.

---

## ⚠️ Error handling

Workflow interaction routes use **`AppError`** and **`handleErrorResponse`**. JSON body:

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "…",
  "stack": "…"
}
```

`stack` appears only in development when configured. Optional **`details`** fields may be merged for specific `AppError` constructions.

| HTTP    | Typical cause                                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **400** | Missing/invalid `X-TENANT-ID` (UUID); Zod validation on query/body/params; invalid `workflowInstanceId` or execution does not match `workflowId`; invalid `since` / `limit` / other schema rules. |
| **401** | Missing/invalid `X-N8N-API-KEY`; missing caller after auth; internal POST without valid bearer.                                                                                                   |
| **403** | No projects for tenant; empty tenant ∩ caller project set; `workflowId` or `workflowInstanceId` not in allowed scope; `requireChwfAllowedProjectIds` (missing locals).                            |
| **404** | Action request not found (by id / actor scope); message N/A for standard list routes.                                                                                                             |
| **500** | `INTERNAL_AUTH_TOKEN` not configured on internal POST path; DB or n8n resolution errors wrapped in handlers; response validation failure; other unhandled errors.                                 |
