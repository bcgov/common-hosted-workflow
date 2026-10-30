# Per-project execution rate limiting

Platform admins can cap how many workflow **executions** each n8n **project** may start per **ISO week** and per **calendar year**. Limits are configured per project through the admin API, stored in the custom database, and enforced by the `workflow.preExecute` external hook, which n8n fires immediately before every workflow run (main process, queue workers, and sub-executions). Usage counters live in the same custom database, so they are independent of n8n's own execution records.

Admins can also grant **one-off weekly top-ups** for the current week or a coming week. A top-up adds runs to that week's configured weekly limit without changing the base configuration or the yearly limit. Multiple top-ups for the same week are summed; when the week rolls over, only the new week's top-ups apply.

Projects **without limits of their own** fall back to the saved per-scope **default limits** — one defaults row for team (tenant) projects and one for personal accounts. With no default saved, that scope stays uncapped.

Each configured project picks a stop behaviour:

- **`hard_stop`** (default) — a run that would exceed a configured limit is rejected before it starts: the hook throws `RateLimitExceededError` and n8n aborts the run.
- **`soft_stop`** — the run is allowed and a warning is logged (monitoring mode).

Enforcement deliberately **fails open**: if the custom database or any other infrastructure dependency is unavailable, runs are allowed. Only a configured hard-stop breach blocks a run.

For the layered architecture these components live in, see [`architecture.md`](./architecture.md).

---

## Source layout

| Path                                                                    | Role                                                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `external-hooks/src/api/bootstrap/rate-limit-hook.ts`                   | `workflow.preExecute` policy: kill switch, exempt modes, counting-process decision, lazy memoized bootstrap |
| `external-hooks/src/api/services/project-rate-limit.service.ts`         | Enforcement + counting, rate-limit update, top-up CRUD, admin reads/enrichment; `RateLimitExceededError`    |
| `external-hooks/src/api/helpers/period.ts`                              | ISO-week / calendar-year period keys and `listUpcomingWeeklyPeriodKeys` for the top-up horizon              |
| `external-hooks/src/db/schema/project-rate-limit.ts`                    | Drizzle table `project_rate_limit`                                                                          |
| `external-hooks/src/db/schema/project-execution-usage.ts`               | Drizzle table `project_execution_usage`                                                                     |
| `external-hooks/src/db/repository/custom/project-rate-limit.ts`         | Config repository: `get`, `upsert`, `listByProjectIds`                                                      |
| `external-hooks/src/db/repository/custom/project-execution-usage.ts`    | Usage counters: `getCounts`, atomic `increment`, `listCountsByProjectIds`                                   |
| `external-hooks/src/db/schema/workflow-execution-usage.ts`              | Drizzle table `workflow_execution_usage`                                                                    |
| `external-hooks/src/db/repository/custom/workflow-execution-usage.ts`   | Per-workflow usage counters: atomic `increment`, `listCountsByWorkflowIds`                                  |
| `external-hooks/src/db/schema/project-topup.ts`                         | Drizzle table `project_topup`                                                                               |
| `external-hooks/src/db/repository/custom/project-topup.ts`              | Top-up history, insert/delete and per-project current-week sums                                             |
| `external-hooks/src/db/schema/project-rate-limit-default.ts`            | Drizzle table `project_rate_limit_default` (per-scope defaults, max 2 rows)                                 |
| `external-hooks/src/db/repository/custom/project-rate-limit-default.ts` | Defaults repository: `get` per scope, `getAll`, atomic `upsertBoth` (one transaction)                       |
| `external-hooks/src/api/schemas/projects.ts`                            | Zod validation for project reads, rate-limit changes and top-up list/create/delete                          |
| `external-hooks/src/api/routes/admin-projects.ts`                       | Admin project reads, rate-limit updates and top-up endpoints                                                |
| `external-hooks/drizzle/0011_add_project_rate_limit_tables.sql`         | Additive-only migration: the two rate-limit tables (applied by the existing `node migrate.cjs` step)        |
| `external-hooks/drizzle/0013_add_workflow_usage_and_updated_by.sql`     | Additive-only migration: `workflow_execution_usage` + `project_rate_limit.updated_by`                       |
| `external-hooks/drizzle/0014_add_project_topup.sql`                     | Additive-only migration: `project_topup`                                                                    |
| `external-hooks/drizzle/0015_add_project_rate_limit_default.sql`        | Additive-only migration: the per-scope defaults table                                                       |
| `external-ui/src/components/projects/manage-topups-dialog.tsx`          | Weekly top-up form, paged history and future-week removal                                                   |
| `external-ui/src/lib/limit-input.ts`                                    | Shared limit parsing/validation for both dialogs (empty input → `null`, annual ≥ weekly, shared bounds)     |
| `external-ui/src/components/projects/default-limits-dialog.tsx`         | Default-limits dialog: team/personal weekly + annual inputs; PUT full-replace body                          |
| `external-ui/src/lib/rate-limit.ts`                                     | Effective weekly limits, status/usage calculations and Vancouver week-key/range helpers                     |
| `helm/_n8n/templates/deployments/worker.yaml`                           | Worker pods receive the custom-database env block                                                           |

---

## Configuration

All values are read once at process start (`external-hooks/src/config.ts`); changing any of them requires a process restart.

| Variable                         | Default             | Purpose                                                                                                                                                            |
| -------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CUSTOM_DATABASE_URL`            | — (required)        | Connects the hook and the admin API to the custom database (local default database name `n8n_custom`). Rate limiting is disabled in any process where it is unset. |
| `RATE_LIMIT_TIMEZONE`            | `America/Vancouver` | Timezone in which weekly and yearly period boundaries are computed. An invalid zone name falls back to the default instead of throwing.                            |
| `RATE_LIMIT_ENFORCEMENT_ENABLED` | `true`              | Master kill switch. Only the exact string `'false'` disables enforcement; unset or any other value leaves it on.                                                   |
| `EXECUTIONS_MODE`                | `regular`           | n8n's own execution mode. In `queue` mode only worker processes count usage (see [Process topology](#process-topology-queue-mode)).                                |

The main deployment already had `CUSTOM_DATABASE_URL`; since this feature, `helm/_n8n/templates/deployments/worker.yaml` injects it (plus the other `CUSTOM_DB_*` variables) from the `customDatabase` secret, mirroring main's env block — workers are the processes that enforce webhook-triggered runs in queue mode.

Note that `RATE_LIMIT_TIMEZONE` is independent of n8n's own `GENERIC_TIMEZONE` (both are `America/Vancouver` in this repo today); changing one does not change the other.

The admin UI also generates week options and renders date ranges in `America/Vancouver`. Keep the server's period timezone aligned with the UI; changing `RATE_LIMIT_TIMEZONE` alone does not change the UI's week boundaries.

---

## Data model

Five tables in the custom database. `0011_add_project_rate_limit_tables.sql` created the rate-limit configuration and the per-project counters; `0013_add_workflow_usage_and_updated_by.sql` added the per-workflow counters and `project_rate_limit.updated_by`; `0014_add_project_topup.sql` adds weekly top-ups; `0015_add_project_rate_limit_default.sql` adds the per-scope defaults table. These are additive-only migrations, applied by the existing `node migrate.cjs` step. The workflow-usage migration was renumbered from 0012 to 0013 during the CCP-6033 merge because main claimed the 0012 slot.

### `project_rate_limit` — per-project configuration

| Column                    | Type         | Constraints                                                          | Meaning                                                                                           |
| ------------------------- | ------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `project_id`              | varchar(50)  | primary key                                                          | n8n project id                                                                                    |
| `weekly_rate_limit`       | integer      | nullable                                                             | Base executions per ISO week, before top-ups; `NULL` = unlimited                                  |
| `yearly_rate_limit`       | integer      | nullable                                                             | Max executions per calendar year; `NULL` = unlimited                                              |
| `last_admin_comment`      | text         | nullable                                                             | Free-form admin note (≤ 2000 chars enforced by the API)                                           |
| `stop_behavior`           | varchar(20)  | `NOT NULL DEFAULT 'hard_stop'`, CHECK `IN ('hard_stop','soft_stop')` | What happens when a limit is reached                                                              |
| `updated_by`              | varchar(255) | nullable                                                             | Email of the admin who last changed the configuration; `NULL` until the first API-mediated change |
| `created_at`/`updated_at` | timestamptz  | `NOT NULL DEFAULT now()`                                             | House-convention timestamps; `updated_at` backs the UI's "Changed <date>" display                 |

- **No row = unconfigured = unlimited.** Nothing is enforced for unconfigured projects — their runs are still counted (always-count, below).
- **`NULL` limits = unlimited for that period** while the row remains (e.g. only a yearly limit configured).
- **`updated_by` is an email, resolved to a display name at read time.** The API stamps it with the authenticated admin's email when limits change; the admin endpoints resolve it against n8n's user table ("F. Last", falling back to the raw email, then to `null`), so responses expose `updatedAt` + `updatedByName` instead of a bare address.

### `project_execution_usage` — per-period counters

| Column                    | Type        | Constraints                                                       |
| ------------------------- | ----------- | ----------------------------------------------------------------- |
| `project_id`              | varchar(50) | part of the composite primary key `pk_project_execution_usage`    |
| `period_type`             | varchar(10) | part of the composite PK; CHECK `IN ('weekly','yearly')`          |
| `period_key`              | varchar(10) | part of the composite PK — `'2026-W44'` (week) or `'2026'` (year) |
| `count`                   | integer     | `NOT NULL DEFAULT 0`                                              |
| `created_at`/`updated_at` | timestamptz | `NOT NULL DEFAULT now()`                                          |

The composite PK (`project_id`, `period_type`, `period_key`) means one counter row per project per period. Counters are incremented with an atomic upsert-increment (`INSERT … ON CONFLICT … DO UPDATE SET count = count + 1`), so concurrent workers can never lose an increment or race each other's inserts into an error.

There is no foreign key to `tenant_project_relation`: rate limits apply to **any** n8n project, not only tenant-mapped ones.

### `workflow_execution_usage` — per-workflow counters

Same shape as the project counters, keyed one level deeper:

| Column                    | Type        | Constraints                                                       |
| ------------------------- | ----------- | ----------------------------------------------------------------- |
| `project_id`              | varchar(50) | part of the composite primary key `pk_workflow_execution_usage`   |
| `workflow_id`             | varchar(50) | part of the composite PK                                          |
| `period_type`             | varchar(10) | part of the composite PK; CHECK `IN ('weekly','yearly')`          |
| `period_key`              | varchar(10) | part of the composite PK — `'2026-W44'` (week) or `'2026'` (year) |
| `count`                   | integer     | `NOT NULL DEFAULT 0`                                              |
| `created_at`/`updated_at` | timestamptz | `NOT NULL DEFAULT now()`                                          |

One row per project/workflow/period, incremented with the same atomic upsert-increment as the project counters, in the same pass (`enforceExecution` bumps both). Like the project counters these are custom-DB rows, so they survive n8n's execution pruning. Indexes on `project_id` and `workflow_id` serve the detail-page reads. There is no foreign key to n8n tables: a workflow removed from a project leaves stale rows behind, which the read endpoints simply exclude.

### `project_topup` — one-off weekly additions

| Column          | Type         | Constraints / meaning                                                                        |
| --------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `id`            | uuid         | Primary key, generated with `gen_random_uuid()`                                              |
| `project_id`    | varchar(50)  | `NOT NULL`; n8n project ID, checked for existence by the service                             |
| `period_key`    | varchar(10)  | `NOT NULL`; CHECK weekly format `YYYY-Www`; the API also validates the live creation horizon |
| `amount`        | integer      | `NOT NULL`, CHECK `> 0`; API bounds each grant at 1–1,000,000 runs                           |
| `admin_comment` | text         | `NOT NULL`; API requires a non-empty trimmed comment of at most 2,000 characters             |
| `created_by`    | varchar(255) | Nullable; authenticated admin's trimmed email, or `NULL` when unavailable                    |
| `created_at`    | timestamptz  | `NOT NULL DEFAULT now()`                                                                     |

The `(project_id, period_key)` index serves current-week sums and project history. There is no unique constraint per project/week: each grant gets its own row, and all amounts for the target week are summed. Rows are not edited; admins can delete a row only before its target week starts. The stored comment, creator and timestamp are the trail for the grant; top-ups do not write to `audit_log`.

The **effective weekly limit** is `weeklyRateLimit + weeklyTopupRuns`, where `weeklyTopupRuns` is the sum for the current ISO weekly key. When `weeklyRateLimit` is `NULL`, the project remains unlimited for that period: top-ups never create a limit on their own. They do not raise the yearly limit or alter usage counters.

### `project_rate_limit_default` — per-scope default limits

| Column                    | Type         | Constraints                                 | Meaning                                                                                 |
| ------------------------- | ------------ | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| `project_kind`            | varchar(20)  | Primary key; CHECK `IN ('team','personal')` | Which scope the row covers — `team` (tenant projects) or `personal` (personal accounts) |
| `weekly_rate_limit`       | integer      | nullable; CHECK `IS NULL OR ≥ 0` when set   | Default base executions per ISO week, before top-ups; `NULL` = no default               |
| `yearly_rate_limit`       | integer      | nullable; CHECK `IS NULL OR ≥ 0` when set   | Default max executions per calendar year; `NULL` = no default                           |
| `updated_by`              | varchar(255) | nullable                                    | Email of the admin who last saved the defaults (trimmed; empty saved as `NULL`)         |
| `created_at`/`updated_at` | timestamptz  | `NOT NULL DEFAULT now()`                    | Convention timestamps                                                                   |

At most **two rows ever exist** — one per `project_kind` (the full-replace PUT writes both scopes in one transaction). **No row or a `NULL` limit means no default for that scope.** A default of `0` is allowed and pauses every uncapped project of that scope, mirroring the per-project limits' `0` semantics. There is no foreign key: the kind mirrors n8n's `project.type`, with unknown/missing types treated as `team` (same as `project-tenant.service.ts`).

---

## Period semantics

- **Weekly periods are ISO-8601 weeks** (Monday–Sunday). Keys are formatted `'YYYY-Www'`, e.g. `'2026-W44'`; the week number is zero-padded and the year is the ISO **week-based year**, which can differ from the calendar year around New Year.
- **Yearly periods are calendar years** (Jan 1 – Dec 31). Keys are plain `'YYYY'`.
- **Boundaries are computed in `RATE_LIMIT_TIMEZONE`** (default `America/Vancouver`), so period rollover follows the operator's local calendar, not the server's UTC clock.
- **DST-safe:** only the local calendar date (Y/M/D) of the instant matters — resolved via `Intl.DateTimeFormat` — so a DST transition never shifts a period key.
- **A run belongs to the period in which it starts.** The hook computes the period keys from the current instant at `preExecute` time; a run that starts late Sunday stays in last week's counter.
- Example: a run starting Monday 2025-12-29 at 00:00 Vancouver time has weekly key `2026-W01` but yearly key `2025` — the ISO week-based year and the calendar year can differ at year boundaries.
- **Top-up horizon:** creation accepts the current week plus the next 25 weeks (26 options, approximately half a year). Past, malformed, impossible or out-of-horizon weekly keys are rejected. Future top-ups take effect automatically when their target week starts; unused runs do not carry forward.

---

## Enforcement semantics

The `workflow.preExecute` hook fires immediately before every workflow run (main process, queue workers, sub-executions). The service:

1. Resolves the workflow's n8n project via `shared_workflow`. A workflow shared with **no** project is never limited or counted; if multiple projects are found (an n8n anomaly — workflows belong to exactly one project), the first is used and a warning is logged.
2. Loads the project's configuration row and the current weekly/yearly counters. For any limit the project does **not** configure, it falls back to the project scope's saved default (`project_rate_limit_default`; the scope is n8n's `project.type`, `team` for unknown types): own configuration wins, defaults fill the gaps. The project-kind lookup and the defaults read run only while some limit is unset, so fully configured projects execute the same queries as before. If an effective weekly limit remains, it also fetches and sums top-ups for the current weekly key.
3. Evaluates breaches: weekly `count >= base limit + current-week top-ups`; yearly `count >= yearly limit`. `NULL` limits are ignored. A yearly limit of `0`, or a weekly base of `0` without top-ups, rejects every non-exempt run.
4. Applies the stop behaviour and — when allowed and this process counts — increments the project's weekly/yearly counters and the workflow's counters in the same pass.

### Rules

- **Check-then-increment; rejected runs never count.** A hard-stop breach throws **before** any increment, so rejected runs do not consume budget.
- **`hard_stop`** throws `RateLimitExceededError` and n8n aborts the run. The message is admin- and user-readable, e.g. `Weekly execution limit reached for project '<id>' (limit 5000, used 5000 in 2026-W44). Execution rejected; contact the platform team to adjust rate limits.`
- **Top-up-aware breach messages.** With a base of 5,000 and 2,000 current-week top-up runs, the limit clause is `limit 7000 (base 5000 + 2000 top-up)`. Without top-ups, the plain `limit 5000` form is unchanged. Yearly breach messages never include a top-up amount.
- **`soft_stop`** logs a warning and allows the run (still counted).
- **Always-count.** Unconfigured and unlimited projects still accumulate usage on the counting process, so the admin list shows real usage for every project.
- **Exempt modes are neither counted nor blocked:** `manual` (editor runs), `internal`, and n8n evaluation modes (`evaluation*`, `eval_*`).
- **Sub-workflow executions count as runs.** `preExecute` also fires for sub-executions, and each is a real execution counting against the same project's limits.
- **Per-workflow counters mirror the project counters.** Every counted run also increments the `(project, workflow)` rows, so the admin detail page shows per-workflow weekly/annual usage from real counter data. The matrix above applies to both levels.
- **Boundary race.** The check and the increment are not one serialized transaction, so a burst of concurrent runs can overshoot a limit by a few executions. Accepted trade-off — the alternative would serialize all of a project's runs.
- **Fail-open.** Any infrastructure error (custom DB unreachable, missing env, service build failure) is logged and the run is allowed. Only `RateLimitExceededError` propagates out of the hook.
- **No unnecessary enforcement lookup.** Top-ups are queried only when an effective weekly limit exists (own configuration or a scope default). The project-kind lookup and the defaults read run only while one of the periods is unset. Lookup failures follow the same fail-open policy as other enforcement infrastructure failures.
- **Default limits apply live.** Saving a scope default starts capping that scope's uncapped projects on their very next run — there is no grandfathering, and no per-project opt-out of a default other than configuring the project's own limits. Clearing a default (saving `null`) uncaps them again without touching per-project rows.
- **Stop behaviour for default-based breaches.** A project with its own configuration row keeps its configured `stopBehavior` even when the breached limit came from a default; a project relying only on defaults has no row, so default-based breaches use the default `hard_stop`.
- **Kill switch.** With `RATE_LIMIT_ENFORCEMENT_ENABLED=false` the hook returns immediately: nothing is enforced and nothing is counted (until restart).

### Matrix

| Situation                                                               | Run allowed?              | Counted? |
| ----------------------------------------------------------------------- | ------------------------- | -------- |
| No config row and no default for the project's scope (uncapped)         | Yes                       | Yes      |
| No config row; a scope default exists and is not reached                | Yes                       | Yes      |
| No config row; a scope default is reached (defaults have no soft stop)  | **No — run aborted**      | No       |
| Configured limit(s) not reached                                         | Yes                       | Yes      |
| Weekly base reached, but effective weekly and yearly limits not reached | Yes                       | Yes      |
| Limit reached, `hard_stop`                                              | **No — run aborted**      | No       |
| Limit reached, `soft_stop`                                              | Yes (warning logged)      | Yes      |
| Exempt mode (`manual` / `internal` / evaluation)                        | Yes                       | No       |
| Workflow not shared with any project                                    | Yes                       | No       |
| Infrastructure error (custom DB unreachable, etc.)                      | Yes (fail-open)           | No       |
| `RATE_LIMIT_ENFORCEMENT_ENABLED=false`                                  | Yes                       | No       |
| `CUSTOM_DATABASE_URL` unset in the process                              | Yes (disabled in process) | No       |

---

## Process topology (queue mode)

The hook loads in every n8n process that has `EXTERNAL_HOOK_FILES` set, but only the process that actually runs an execution counts it:

- `countUsage = EXECUTIONS_MODE !== 'queue' || isWorkerProcess()` — in **regular (non-queue) mode** (e.g. docker-compose) the single process both enforces and counts; in **queue mode** only workers count.
- **Main pre-checks without counting.** Runs initiated through main fire `preExecute` there first; main evaluates the limits and can reject the run, but with `countUsage=false` it never increments — so a run that fires the hook on both main and the worker is counted exactly once (on the worker). Editor manual/evaluation runs are exempt entirely, on both processes.
- **Workers enforce and count** production runs (webhook-triggered and queue-job runs).
- **The webhook process does not load external hooks at all** — `EXTERNAL_HOOK_FILES` is unset in its deployment — so webhook-triggered runs are enforced solely on the worker that picks up the job.
- **Workers never see `n8n.ready`**, so the hook cannot reuse the ready-hook services. It lazily builds its own `ProjectRateLimitService` on first use and memoizes it (in main this is intentionally a separate instance). A transient build failure is retried on the next execution; a missing `CUSTOM_DATABASE_URL` disables enforcement in that process permanently, with a single error log.

### Rejected webhook-triggered runs

The webhook process creates and enqueues the execution record **before** the worker runs the job, so when the worker rejects the run the record already exists: a rejected webhook-triggered run still shows up as a **failed execution** in n8n. The usage counters do **not** count it.

---

## Admin API

All endpoints below are on the existing admin router mounted at **`/ui-api/admin`** (the `/rest/admin/...` prefixes still present in some source JSDoc comments are legacy — `/ui-api/admin/...` is the real path).

**Auth:** UI session (`Authorization: Bearer`, via `requireUiRequestContext`) + `canManageProject` permission + `global:owner` or `global:admin` role — the same guard chain as the tenant endpoints.

### `GET /ui-api/admin/projects`

Unchanged route; the service now enriches every item. Query parameters are unchanged (`page` default 1, `pageSize` default 25 max 100, `search`, `type`). Each item keeps `projectId`, `projectName`, `projectType`, `tenantId` and gains:

| Field                  | Type                               | Meaning                                                                           |
| ---------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| `weeklyRateLimit`      | number \| null                     | Configured base weekly limit, before top-ups; `null` when unconfigured            |
| `yearlyRateLimit`      | number \| null                     | Configured yearly limit; `null` when unconfigured                                 |
| `stopBehavior`         | 'hard_stop' \| 'soft_stop' \| null | `null` when the project is unconfigured                                           |
| `lastAdminComment`     | string \| null                     | Last admin note; `null` when unset                                                |
| `weeklyExecutionCount` | number                             | Executions in the current ISO week (0 default)                                    |
| `yearlyExecutionCount` | number                             | Executions in the current calendar year (0 default)                               |
| `weeklyTopupRuns`      | number                             | Sum of top-up amounts for the current ISO week (0 default)                        |
| `workflowCount`        | number                             | Workflows shared with the project (0 default)                                     |
| `membersCount`         | number                             | Project members, from n8n's project relations (0 default)                         |
| `updatedAt`            | string \| null                     | When the rate-limit config was last changed (ISO 8601); `null` when never changed |
| `updatedByName`        | string \| null                     | Display name of the admin who made the last change; `null` when unknown           |

Example item (inside the usual `{ "data": [...], "pagination": { ... } }` envelope):

```json
{
  "projectId": "pKQ8pX7cQFdB",
  "projectName": "Example project",
  "projectType": "team",
  "tenantId": null,
  "weeklyRateLimit": 5000,
  "yearlyRateLimit": 200000,
  "stopBehavior": "hard_stop",
  "lastAdminComment": "Tier A pilot limits",
  "weeklyExecutionCount": 12,
  "yearlyExecutionCount": 340,
  "weeklyTopupRuns": 2000,
  "workflowCount": 4,
  "membersCount": 6,
  "updatedAt": "2026-10-26T23:01:02.345Z",
  "updatedByName": "N. McInnis"
}
```

`weeklyRateLimit` remains the base configuration; clients calculate the effective weekly limit by adding `weeklyTopupRuns` when the base is not `null`. Current-week sums are returned even when no weekly limit is configured, but have no effect until one is configured.

**Errors never break the list:** enrichment failures (e.g. custom-DB outage) are logged and fall back to defaults — `null` limits/comment, `0` counts/top-up runs, `null` `updatedAt`/`updatedByName` — so the project list keeps working.

### `GET /ui-api/admin/projects/rate-limit-defaults`

Returns the saved per-scope default limits. The response intentionally carries **no usage counts** — the defaults dialog needs only the saved values. This route is a literal path registered **before** the `/projects/:projectId` routes, otherwise Express would treat `rate-limit-defaults` as a project id.

```json
{
  "team": { "weeklyRateLimit": 5000, "yearlyRateLimit": 250000 },
  "personal": { "weeklyRateLimit": null, "yearlyRateLimit": null }
}
```

A missing row (or `null` field) means that scope has no default: projects of that scope without their own limits stay uncapped.

### `PUT /ui-api/admin/projects/rate-limit-defaults`

Full-replace semantics for **both scopes in one atomic write**; every field is required.

| Field-path                 | Validation                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `team.weeklyRateLimit`     | integer `0`–`1,000,000`, or `null` (no default for that scope)                           |
| `team.yearlyRateLimit`     | integer `0`–`100,000,000`, or `null`; must be ≥ `team.weeklyRateLimit` when both set     |
| `personal.weeklyRateLimit` | integer `0`–`1,000,000`, or `null`                                                       |
| `personal.yearlyRateLimit` | integer `0`–`100,000,000`, or `null`; must be ≥ `personal.weeklyRateLimit` when both set |

Example body (mirroring the dialog's output where personal fields were left blank):

```json
{
  "team": { "weeklyRateLimit": 5000, "yearlyRateLimit": 250000 },
  "personal": { "weeklyRateLimit": null, "yearlyRateLimit": null }
}
```

**200** response: `{ "success": true, "message": "Default limits updated", "defaults": <saved values as GET> }`. The acting admin's email from the UI session is stamped (trimmed; empty/unavailable stored as `null`). Errors use the standard shape: **400** for validation failures (missing scope, non-int, out-of-range, `yearly < weekly`), **401/403** for missing session/permission/role; a missing table or other custom-DB failure surfaces as **500**.

### `GET /ui-api/admin/projects/:projectId`

Same guard chain and the same item shape as the list, enrichment included. Backs the admin project detail page. **404** (`Project not found`) when the project does not exist.

### `GET /ui-api/admin/projects/:projectId/workflow-usage`

Per-workflow execution counts for the project's workflows, for the current weekly/yearly periods (keys returned as `weeklyPeriodKey` / `yearlyPeriodKey`):

```json
{
  "projectId": "pKQ8pX7cQFdB",
  "weeklyPeriodKey": "2026-W44",
  "yearlyPeriodKey": "2026",
  "workflows": [
    { "workflowId": "wAbCdEfGhIjK", "workflowName": "Invoice QR intake", "weeklyCount": 2850, "yearlyCount": 121000 }
  ]
}
```

Counts come from `workflow_execution_usage` (custom DB), sorted by workflow name. Usage rows whose workflow is no longer shared with the project are excluded. **404** (`Project not found`) when the project is unknown.

### `PUT /ui-api/admin/projects/:projectId/rate-limit`

Full-replace semantics, aligned with the tenant endpoints: **every body field is required**; an explicit `null` clears a limit or the comment.

| Field              | Validation                                            |
| ------------------ | ----------------------------------------------------- |
| `weeklyRateLimit`  | integer, `0`–`1,000,000`, or `null` (clears)          |
| `yearlyRateLimit`  | integer, `0`–`100,000,000`, or `null` (clears)        |
| `lastAdminComment` | string ≤ 2000 chars, or `null` (clears)               |
| `stopBehavior`     | `'hard_stop'` or `'soft_stop'` (required, never null) |

Example request body:

```json
{
  "weeklyRateLimit": 5000,
  "yearlyRateLimit": 200000,
  "lastAdminComment": "Tier A pilot limits",
  "stopBehavior": "hard_stop"
}
```

**200** response (`rateLimit` is the stored row; `updatedBy` records the authenticated admin's email, from the UI session):

```json
{
  "success": true,
  "message": "Rate limit updated",
  "rateLimit": {
    "projectId": "pKQ8pX7cQFdB",
    "weeklyRateLimit": 5000,
    "yearlyRateLimit": 200000,
    "lastAdminComment": "Tier A pilot limits",
    "stopBehavior": "hard_stop",
    "updatedBy": "admin.user@testapp.com",
    "createdAt": "2026-10-26T23:01:02.345Z",
    "updatedAt": "2026-10-26T23:01:02.345Z"
  }
}
```

Errors use the standard `{ "error": { "message": "…" } }` shape:

| HTTP | Cause                                                                                        |
| ---- | -------------------------------------------------------------------------------------------- |
| 400  | Zod validation failed (missing field, non-int, out-of-range, bad enum, comment > 2000 chars) |
| 401  | Missing or invalid UI session                                                                |
| 403  | Caller lacks `canManageProject` or the global owner/admin role                               |
| 404  | Unknown project (`Project not found`)                                                        |
| 500  | Stored row could not be read back after the write                                            |

### `GET /ui-api/admin/projects/:projectId/topups`

Lists a project's stored top-ups, including past, current and future weeks, ordered by **`period_key DESC, created_at DESC`** (latest target week first, newest grant first within a week).

Query parameters: `page` is an integer ≥ 1 (default 1); `pageSize` is an integer from 1 to 100 (default 4). **200** response:

```json
{
  "data": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "projectId": "pKQ8pX7cQFdB",
      "periodKey": "2026-W45",
      "amount": 2000,
      "adminComment": "Extra runs for the quarterly batch",
      "createdBy": "admin.user@example.com",
      "createdAt": "2026-10-28T22:30:00.000Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 4, "totalItems": 1, "totalPages": 1 }
}
```

An empty project history returns `data: []` and `totalPages: 1`. Invalid paging returns **400**; an unknown project returns **404** (`Project not found`).

### `POST /ui-api/admin/projects/:projectId/topups`

Adds a weekly top-up. All body fields are required:

| Field          | Validation                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `periodKey`    | ISO key `YYYY-Www`, one of the current week plus the next 25 weeks in the server's period zone |
| `amount`       | Integer, 1–1,000,000 runs                                                                      |
| `adminComment` | Trimmed, non-empty string, at most 2,000 characters                                            |

Example body:

```json
{
  "periodKey": "2026-W45",
  "amount": 2000,
  "adminComment": "Extra runs for the quarterly batch"
}
```

**200** response is `{ "success": true, "message": "Top-up added", "topup": <stored row> }`; `topup` has the same row fields as the list above. The service stamps `createdBy` from the UI session's admin email (trimmed; empty or unavailable becomes `null`), not from the request body.

Multiple grants for a week are allowed. Creation is also allowed without a weekly limit, but the top-up has no enforcement effect while that limit is unconfigured. Invalid input, past/impossible keys and keys outside the live horizon return **400**. An unknown project returns **404** (`Project not found`).

### `DELETE /ui-api/admin/projects/:projectId/topups/:topupId`

Deletes a top-up **only if its target week has not started**: its key must be strictly after the server's current weekly key. Current-week rows are already in effect and cannot be removed, even if they were just added. The lookup is scoped to the requested project.

- **204** on success, with no response body.
- **400** for a malformed `topupId` (must be a UUID).
- **404** for an unknown project (`Project not found`) or a missing row/row belonging to another project (`Top-up not found`).
- **409** for current or past weeks (`Top-ups for the current or past weeks cannot be deleted`).

The UI hides removal buttons for started weeks, but the server independently rechecks at deletion time. All top-up endpoints inherit the session/permission/role guards described above (401/403 on unauthorized callers).

---

## Admin UI (Projects page)

The external-ui admin **Projects** page (`/projects`) renders this API data for platform admins: aggregate stat cards (runs this week, limit reached, near limit, no limit), Tenants / Personal accounts tabs, client-side search + status filter over the full project list (fetched in pages of 100), and a usage table with weekly/annual progress bars, status badges and per-project links. Status and bar tones are computed client-side: reached = count ≥ limit; near = ≥ 80% of any set limit; red at ≥ 100%, amber at ≥ 75%. Weekly comparisons and bars use the effective limit (base plus current-week top-ups); yearly comparisons are unchanged.

Each row links to a per-project detail page (`/projects/:projectId`): limit cards with "Changed <date> by <name>" attribution (`updatedAt`/`updatedByName`), reset dates (next Monday / Jan 1, `America/Vancouver`), a member count from the project's relations, a per-workflow runs table from the workflow-usage endpoint, tenant-ID inline editing, and an "Edit limits" dialog (weekly/annual limits, stop behaviour, required reason) that PUTs the full-replace body.

The weekly card uses the effective limit and shows `Includes +N top-up` only when current-week top-ups are positive; the annual card has no top-up footer. The near/reached banner uses the same effective percentage and describes the current week as `Top-up: +N runs this week` or `Top-up: none this week` (no projection placeholder).

The **Manage top-ups** header button opens **Manage top-ups for <project>**:

- **Period** offers the current week (`This week (Oct 26 to Nov 1)`) plus 25 coming weeks, labelled by date range without a `Weekly` prefix.
- **Top-up amount** accepts whole runs (commas/spaces tolerated); **Admin comment** is required and saved with the grant. The limit summary includes current-week top-ups and warns when no weekly limit is configured.
- **Cancel / Add top-up** sit directly below the admin comment, above the separator and history. Successful creation keeps the dialog and selected period open, clears the amount/comment, and refreshes history plus the project list/detail queries. Background project refetches do not wipe an in-progress entry.
- **History** is paged four rows at a time, in API order. Columns are Amount, Added, **Week** (the Monday–Sunday date range), Comment and actions; there is no separate Period or Ends column. Only future-week rows show a removal action, which requires confirmation.

The **Default limits** header button on the Projects list opens a dialog with two fieldsets — **Team projects (tenants)** and **Personal accounts** — each seeding widget-style weekly + annual inputs from the saved defaults. Empty input means "no default": saving blank fields stores `null` and leaves that scope's uncapped projects uncapped. Validation matches the per-project dialog (whole numbers with commas tolerated, shared API bounds, annual ≥ weekly per scope) and reports errors inline per field. **Cancel** discards, **Save defaults** PUTs the full-replace body and closes; there is no reset action, and no usage counts are fetched or shown.

The list-page period selector remains current-week-only, and historical usage browsing is not implemented. **Known trade-off:** the projects list and detail pages still show explicit configuration only — a team project capped only by the team default still reads "No limit set" in the UI while its runs are enforced.

---

## Operational notes

- **Roll out the image and the helm worker env in the same release.** The enforcement hook ships in the image, but workers also need `CUSTOM_DATABASE_URL` (now injected from the `customDatabase` secret, mirroring main's block). A worker without it logs one error — `Rate limiting disabled in this process: CUSTOM_DATABASE_URL is not set` — and stays fail-open for the life of the pod: nothing is enforced **or counted** for queue runs.
- **Apply migration `0014` with the top-up backend/UI release** using the existing provision step. Weekly enforcement and admin enrichment read `project_topup`; a missing table follows the existing fail-open/default-enrichment behavior. Before production, smoke-test current-week sums, automatic future-week activation and worker-side queue enforcement in a dev namespace.
- **Apply migration `0015` with the defaults release.** Until it is applied, the defaults endpoints fail at the custom-DB layer (`GET` returns a 500) and enforcement treats the unusable defaults lookup as an infrastructure failure and fails open — explicitly configured projects are unaffected, nothing is rejected by defaults before the migration lands.
- **Saving defaults starts capping today's uncapped projects.** There is no grandfathering: the next run of any project without its own limits is governed by the new default. To walk it back, save the fields empty (which stores `null`, no default) — the defaults dialog never touches per-project rows. A default of `0` pauses every uncapped project of the scope.
- **Default limits stay enforced in queue mode** exactly like configured limits (worker-side counting and rejection); the existing worker-env + migration smoke test covers default-based caps as well.
- **A default-capped project reads "No limit set" in the UI** (list/detail show explicit configuration only) — flag for admins when default capping is introduced.
- **Kill switch:** `RATE_LIMIT_ENFORCEMENT_ENABLED=false` stops all enforcement; it takes effect after a process restart (env is read once at startup).
- **Safe rollout by default:** with no `project_rate_limit` rows configured, nothing is ever rejected; usage counters still accumulate — exactly what you want before picking limits, since the admin list then shows real usage for every project.
- **Counters survive n8n's execution pruning by design.** n8n prunes its own execution records after a deployment-configured age — this repo's helm sets `EXECUTIONS_DATA_PRUNE: "true"` with `EXECUTIONS_DATA_MAX_AGE: "336"` (hours ≈ 14 days) in the base values, and `8784` (1 year) in the prod values files — so counting live `execution_entity` rows would silently undercount yearly usage. The dedicated counter rows in the custom DB are unaffected.
- **Old period rows accumulate slowly** — one row per project (plus one per project/workflow) per period; a weekly row stops being read at the next week rollover. Retention/cleanup is a follow-up (explicit non-goal of the initial release).
- **Resumed (waiting) executions** may re-fire the pre-run hook on the worker; if n8n does so, a resumed run adds one extra usage increment. Upstream behaviour is not yet confirmed; the possible overcount is accepted.

---

## n8n upgrade caveat

This feature depends on verified `n8n@2.36.2` behaviour: `workflow.preExecute` fires on `workflowExecuteBefore` in main (regular and queue mode), in workers and for sub-executions; a throwing hook aborts the run, and on main an editor-initiated run is aborted **before** its execution record is created. **n8n 3.x changes `preExecute` error/record semantics and removes `N8N_PRE_EXECUTE_ERROR_CREATES_EXECUTION`.** On the next n8n upgrade, re-verify hook firing, error propagation and execution-record behaviour — and re-run the rate-limit tests — before shipping.
