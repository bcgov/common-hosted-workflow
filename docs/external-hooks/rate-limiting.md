# Per-project execution rate limiting

Platform admins can cap how many workflow **executions** each n8n **project** may start per **ISO week** and per **calendar year**. Limits are configured per project through the admin API, stored in the custom database, and enforced by the `workflow.preExecute` external hook, which n8n fires immediately before every workflow run (main process, queue workers, and sub-executions). Usage counters live in the same custom database, so they are independent of n8n's own execution records.

Each configured project picks a stop behaviour:

- **`hard_stop`** (default) — a run that would exceed a configured limit is rejected before it starts: the hook throws `RateLimitExceededError` and n8n aborts the run.
- **`soft_stop`** — the run is allowed and a warning is logged (monitoring mode).

Enforcement deliberately **fails open**: if the custom database or any other infrastructure dependency is unavailable, runs are allowed. Only a configured hard-stop breach blocks a run.

For the layered architecture these components live in, see [`architecture.md`](./architecture.md).

---

## Source layout

| Path                                                                 | Role                                                                                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `external-hooks/src/api/bootstrap/rate-limit-hook.ts`                | `workflow.preExecute` policy: kill switch, exempt modes, counting-process decision, lazy memoized bootstrap |
| `external-hooks/src/api/services/project-rate-limit.service.ts`      | Enforcement + counting, admin update, admin-list enrichment; `RateLimitExceededError`                       |
| `external-hooks/src/api/helpers/period.ts`                           | ISO-week / calendar-year period keys (`getWeeklyPeriodKey`, `getYearlyPeriodKey`, `getCurrentPeriodKeys`)   |
| `external-hooks/src/db/schema/project-rate-limit.ts`                 | Drizzle table `project_rate_limit`                                                                          |
| `external-hooks/src/db/schema/project-execution-usage.ts`            | Drizzle table `project_execution_usage`                                                                     |
| `external-hooks/src/db/repository/custom/project-rate-limit.ts`      | Config repository: `get`, `upsert`, `listByProjectIds`                                                      |
| `external-hooks/src/db/repository/custom/project-execution-usage.ts` | Usage counters: `getCounts`, atomic `increment`, `listCountsByProjectIds`                                   |
| `external-hooks/src/api/schemas/projects.ts`                         | `updateProjectRateLimitSchema` (zod request validation)                                                     |
| `external-hooks/src/api/routes/admin-projects.ts`                    | `GET /projects` and `PUT /projects/:projectId/rate-limit` routes                                            |
| `external-hooks/drizzle/0011_add_project_rate_limit_tables.sql`      | Additive-only migration (applied by the existing `node migrate.cjs` step)                                   |
| `helm/_n8n/templates/deployments/worker.yaml`                        | Worker pods receive the custom-database env block                                                           |

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

---

## Data model

Two tables in the custom database, created by the additive-only migration `external-hooks/drizzle/0011_add_project_rate_limit_tables.sql`.

### `project_rate_limit` — per-project configuration

| Column                    | Type        | Constraints                                                          | Meaning                                                 |
| ------------------------- | ----------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| `project_id`              | varchar(50) | primary key                                                          | n8n project id                                          |
| `weekly_rate_limit`       | integer     | nullable                                                             | Max executions per ISO week; `NULL` = unlimited         |
| `yearly_rate_limit`       | integer     | nullable                                                             | Max executions per calendar year; `NULL` = unlimited    |
| `last_admin_comment`      | text        | nullable                                                             | Free-form admin note (≤ 2000 chars enforced by the API) |
| `stop_behavior`           | varchar(20) | `NOT NULL DEFAULT 'hard_stop'`, CHECK `IN ('hard_stop','soft_stop')` | What happens when a limit is reached                    |
| `created_at`/`updated_at` | timestamptz | `NOT NULL DEFAULT now()`                                             | House-convention timestamps                             |

- **No row = unconfigured = unlimited.** Nothing is enforced for unconfigured projects — their runs are still counted (always-count, below).
- **`NULL` limits = unlimited for that period** while the row remains (e.g. only a yearly limit configured).

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

---

## Period semantics

- **Weekly periods are ISO-8601 weeks** (Monday–Sunday). Keys are formatted `'YYYY-Www'`, e.g. `'2026-W44'`; the week number is zero-padded and the year is the ISO **week-based year**, which can differ from the calendar year around New Year.
- **Yearly periods are calendar years** (Jan 1 – Dec 31). Keys are plain `'YYYY'`.
- **Boundaries are computed in `RATE_LIMIT_TIMEZONE`** (default `America/Vancouver`), so period rollover follows the operator's local calendar, not the server's UTC clock.
- **DST-safe:** only the local calendar date (Y/M/D) of the instant matters — resolved via `Intl.DateTimeFormat` — so a DST transition never shifts a period key.
- **A run belongs to the period in which it starts.** The hook computes the period keys from the current instant at `preExecute` time; a run that starts late Sunday stays in last week's counter.
- Example: a run starting Monday 2025-12-29 at 00:00 Vancouver time has weekly key `2026-W01` but yearly key `2025` — the ISO week-based year and the calendar year can differ at year boundaries.

---

## Enforcement semantics

The `workflow.preExecute` hook fires immediately before every workflow run (main process, queue workers, sub-executions). The service:

1. Resolves the workflow's n8n project via `shared_workflow`. A workflow shared with **no** project is never limited or counted; if multiple projects are found (an n8n anomaly — workflows belong to exactly one project), the first is used and a warning is logged.
2. Loads the project's configuration row and the current weekly/yearly counters.
3. Evaluates breaches: a breach is `count >= limit` for any configured (non-`NULL`) limit. A configured limit of `0` therefore rejects every non-exempt run.
4. Applies the stop behaviour and — when allowed and this process counts — increments both counters.

### Rules

- **Check-then-increment; rejected runs never count.** A hard-stop breach throws **before** any increment, so rejected runs do not consume budget.
- **`hard_stop`** throws `RateLimitExceededError` and n8n aborts the run. The message is admin- and user-readable, e.g. `Weekly execution limit reached for project '<id>' (limit 5000, used 5000 in 2026-W44). Execution rejected; contact the platform team to adjust rate limits.`
- **`soft_stop`** logs a warning and allows the run (still counted).
- **Always-count.** Unconfigured and unlimited projects still accumulate usage on the counting process, so the admin list shows real usage for every project.
- **Exempt modes are neither counted nor blocked:** `manual` (editor runs), `internal`, and n8n evaluation modes (`evaluation*`, `eval_*`).
- **Sub-workflow executions count as runs.** `preExecute` also fires for sub-executions, and each is a real execution counting against the same project's limits.
- **Boundary race.** The check and the increment are not one serialized transaction, so a burst of concurrent runs can overshoot a limit by a few executions. Accepted trade-off — the alternative would serialize all of a project's runs.
- **Fail-open.** Any infrastructure error (custom DB unreachable, missing env, service build failure) is logged and the run is allowed. Only `RateLimitExceededError` propagates out of the hook.
- **Kill switch.** With `RATE_LIMIT_ENFORCEMENT_ENABLED=false` the hook returns immediately: nothing is enforced and nothing is counted (until restart).

### Matrix

| Situation                                          | Run allowed?              | Counted? |
| -------------------------------------------------- | ------------------------- | -------- |
| No config row (unconfigured project)               | Yes                       | Yes      |
| Configured limit(s) not reached                    | Yes                       | Yes      |
| Limit reached, `hard_stop`                         | **No — run aborted**      | No       |
| Limit reached, `soft_stop`                         | Yes (warning logged)      | Yes      |
| Exempt mode (`manual` / `internal` / evaluation)   | Yes                       | No       |
| Workflow not shared with any project               | Yes                       | No       |
| Infrastructure error (custom DB unreachable, etc.) | Yes (fail-open)           | No       |
| `RATE_LIMIT_ENFORCEMENT_ENABLED=false`             | Yes                       | No       |
| `CUSTOM_DATABASE_URL` unset in the process         | Yes (disabled in process) | No       |

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

Both endpoints are on the existing admin router mounted at **`/ui-api/admin`** (the `/rest/admin/...` prefixes still present in some source JSDoc comments are legacy — `/ui-api/admin/...` is the real path).

**Auth:** UI session (`Authorization: Bearer`, via `requireUiRequestContext`) + `canManageProject` permission + `global:owner` or `global:admin` role — the same guard chain as the tenant endpoints.

### `GET /ui-api/admin/projects`

Unchanged route; the service now enriches every item. Query parameters are unchanged (`page` default 1, `pageSize` default 25 max 100, `search`, `type`). Each item keeps `projectId`, `projectName`, `projectType`, `tenantId` and gains:

| Field                  | Type                               | Meaning                                             |
| ---------------------- | ---------------------------------- | --------------------------------------------------- |
| `weeklyRateLimit`      | number \| null                     | Configured weekly limit; `null` when unconfigured   |
| `yearlyRateLimit`      | number \| null                     | Configured yearly limit; `null` when unconfigured   |
| `stopBehavior`         | 'hard_stop' \| 'soft_stop' \| null | `null` when the project is unconfigured             |
| `lastAdminComment`     | string \| null                     | Last admin note; `null` when unset                  |
| `weeklyExecutionCount` | number                             | Executions in the current ISO week (0 default)      |
| `yearlyExecutionCount` | number                             | Executions in the current calendar year (0 default) |
| `workflowCount`        | number                             | Workflows shared with the project (0 default)       |

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
  "workflowCount": 4
}
```

**Errors never break the list:** enrichment failures (e.g. custom-DB outage) are logged and fall back to defaults — `null` limits/comment, `0` counts — so the project list keeps working.

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

**200** response (`rateLimit` is the stored row):

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

---

## Operational notes

- **Roll out the image and the helm worker env in the same release.** The enforcement hook ships in the image, but workers also need `CUSTOM_DATABASE_URL` (now injected from the `customDatabase` secret, mirroring main's block). A worker without it logs one error — `Rate limiting disabled in this process: CUSTOM_DATABASE_URL is not set` — and stays fail-open for the life of the pod: nothing is enforced **or counted** for queue runs.
- **Kill switch:** `RATE_LIMIT_ENFORCEMENT_ENABLED=false` stops all enforcement; it takes effect after a process restart (env is read once at startup).
- **Safe rollout by default:** with no `project_rate_limit` rows configured, nothing is ever rejected; usage counters still accumulate — exactly what you want before picking limits, since the admin list then shows real usage for every project.
- **Counters survive n8n's execution pruning by design.** n8n prunes its own execution records after a deployment-configured age — this repo's helm sets `EXECUTIONS_DATA_PRUNE: "true"` with `EXECUTIONS_DATA_MAX_AGE: "336"` (hours ≈ 14 days) in the base values, and `8784` (1 year) in the prod values files — so counting live `execution_entity` rows would silently undercount yearly usage. The dedicated counter rows in the custom DB are unaffected.
- **Old period rows accumulate slowly** — one row per project per period; a weekly row stops being read at the next week rollover. Retention/cleanup is a follow-up (explicit non-goal of the initial release).
- **Resumed (waiting) executions** may re-fire the pre-run hook on the worker; if n8n does so, a resumed run adds one extra usage increment. Upstream behaviour is not yet confirmed; the possible overcount is accepted.

---

## n8n upgrade caveat

This feature depends on verified `n8n@2.36.2` behaviour: `workflow.preExecute` fires on `workflowExecuteBefore` in main (regular and queue mode), in workers and for sub-executions; a throwing hook aborts the run, and on main an editor-initiated run is aborted **before** its execution record is created. **n8n 3.x changes `preExecute` error/record semantics and removes `N8N_PRE_EXECUTE_ERROR_CREATES_EXECUTION`.** On the next n8n upgrade, re-verify hook firing, error propagation and execution-record behaviour — and re-run the rate-limit tests — before shipping.
