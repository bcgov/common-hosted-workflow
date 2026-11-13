# Per-project execution rate limiting

Platform admins can cap how many workflow **executions** each n8n **project** may start per **ISO week** and per **calendar year**. Limits are configured per project through the admin API, stored in the custom database, and enforced by the `workflow.preExecute` external hook, which n8n fires immediately before every workflow run (main process, queue workers, and sub-executions). Usage counters live in the same custom database, so they are independent of n8n's own execution records.

Admins can also grant **one-off weekly top-ups** for the current week or a coming week. A top-up adds runs to that week's configured weekly limit, and — because every counted run also accrues to the calendar-year counter — the same amount is added to the yearly limit of every calendar year the target week overlaps (normally one year; the one or two ISO weeks straddling January 1 count for both). This keeps the two gates consistent: the yearly limit can never block runs the top-up-boosted weekly limit allowed. Multiple top-ups are summed per week; when the week rolls over, only the new week's top-ups apply.

Projects **without limits of their own** fall back to the saved per-scope **default limits** — one defaults row for team (tenant) projects and one for personal accounts. With no default saved, that scope stays uncapped. A project can also be switched **explicitly** to its scope defaults (or back to custom values) via `usesDefaultLimits`; see the data model below.

Each configured project picks a stop behaviour:

- **`hard_stop`** (default) — a run that would exceed a configured limit is rejected before it starts: the hook throws `RateLimitExceededError` and n8n aborts the run.
- **`soft_stop`** — the run is allowed and a warning is logged (monitoring mode).

Enforcement deliberately **fails open**: if the custom database or any other infrastructure dependency is unavailable, runs are allowed. Only a configured hard-stop breach blocks a run.

Projects' **admins and editors are notified by email** when a limit is reached or crossed (50% / 80% near-limit thresholds), when a top-up is granted to their project, and when the project's limits change; platform admins are additionally notified when a project is fully paused by a hard-stop breach. See _Email notifications_ below.

For the layered architecture these components live in, see [`architecture.md`](./architecture.md).

---

## Source layout

| Path                                                                    | Role                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `external-hooks/src/api/bootstrap/rate-limit-hook.ts`                   | `workflow.preExecute` policy: kill switch, exempt modes, counting-process decision, lazy memoized bootstrap                                                                                                                 |
| `external-hooks/src/api/services/project-rate-limit.service.ts`         | Enforcement + counting, rate-limit update, top-up CRUD, admin reads/enrichment, email notifications; `RateLimitExceededError`                                                                                               |
| `external-hooks/src/api/helpers/period.ts`                              | ISO-week / calendar-year period keys, `listUpcomingWeeklyPeriodKeys` (top-up horizon), `listWeeklyPeriodKeysOverlappingYearlyPeriod` (yearly top-up aggregation), reset dates and week-range labels for notification emails |
| `external-hooks/src/api/services/node-mailer.ts`                        | Mailer wrapper around n8n's `NodeMailer` (sanitize + plain-text) — shared with access-request emails                                                                                                                        |
| `external-hooks/src/api/services/email-templates.ts`                    | Handlebars templates: access requests and rate-limit notifications (reached, near-limit, top-up granted, limits changed)                                                                                                    |
| `external-hooks/src/db/schema/project-rate-limit.ts`                    | Drizzle table `project_rate_limit`                                                                                                                                                                                          |
| `external-hooks/src/db/schema/project-execution-usage.ts`               | Drizzle table `project_execution_usage`                                                                                                                                                                                     |
| `external-hooks/src/db/repository/custom/project-rate-limit.ts`         | Config repository: `get`, `upsert`, `listByProjectIds`                                                                                                                                                                      |
| `external-hooks/src/db/repository/custom/project-execution-usage.ts`    | Usage counters: `getCounts`, atomic `increment`, `listCountsByProjectIds`                                                                                                                                                   |
| `external-hooks/src/db/schema/workflow-execution-usage.ts`              | Drizzle table `workflow_execution_usage`                                                                                                                                                                                    |
| `external-hooks/src/db/repository/custom/workflow-execution-usage.ts`   | Per-workflow usage counters: atomic `increment`, `listCountsByWorkflowIds`                                                                                                                                                  |
| `external-hooks/src/db/schema/project-topup.ts`                         | Drizzle table `project_topup`                                                                                                                                                                                               |
| `external-hooks/src/db/repository/custom/project-topup.ts`              | Top-up history, insert/delete, per-project current-week sums and in-year (multi-week) sums                                                                                                                                  |
| `external-hooks/src/db/schema/project-rate-limit-default.ts`            | Drizzle table `project_rate_limit_default` (per-scope defaults, max 2 rows)                                                                                                                                                 |
| `external-hooks/src/db/repository/custom/project-rate-limit-default.ts` | Defaults repository: `get` per scope, `getAll`, atomic `upsertBoth` (one transaction)                                                                                                                                       |
| `external-hooks/src/api/schemas/projects.ts`                            | Zod validation for project reads, rate-limit changes and top-up list/create/delete                                                                                                                                          |
| `external-hooks/src/api/routes/projects.ts`                             | Shared project read endpoints (`/ui-api/projects`): admins get all projects, members their own                                                                                                                              |
| `external-hooks/src/api/routes/admin-projects.ts`                       | Admin project writes (limits, tenant mapping, top-ups), the defaults endpoints and the run-request review endpoints (`/ui-api/admin/projects/run-requests*`)                                                                |
| `external-hooks/drizzle/0011_add_project_rate_limit_tables.sql`         | Additive-only migration: the two rate-limit tables (applied by the existing `node migrate.cjs` step)                                                                                                                        |
| `external-hooks/drizzle/0013_add_workflow_usage_and_updated_by.sql`     | Additive-only migration: `workflow_execution_usage` + `project_rate_limit.updated_by`                                                                                                                                       |
| `external-hooks/drizzle/0014_add_project_topup.sql`                     | Additive-only migration: `project_topup`                                                                                                                                                                                    |
| `external-hooks/drizzle/0015_add_project_rate_limit_default.sql`        | Additive-only migration: the per-scope defaults table                                                                                                                                                                       |
| `external-hooks/drizzle/0016_add_project_uses_default_limits.sql`       | Additive-only migration: `project_rate_limit.uses_default_limits` (defaults mode; backfills legacy rows as custom)                                                                                                          |
| `external-hooks/drizzle/0017_add_rate_limit_notification.sql`           | Additive-only migration: `rate_limit_notification` claim table (send-once notification dedup)                                                                                                                               |
| `external-hooks/drizzle/0018_add_rate_limit_request.sql`                | Additive-only migration: `rate_limit_request` member request table (one pending request per project via partial unique index)                                                                                               |
| `external-hooks/drizzle/0019_add_run_request_decision.sql`              | Additive-only migration: decision columns on `rate_limit_request` (`granted_runs`, `decided_weekly_limit`, `decided_annual_limit`, `decision_note`, `decided_by`, `decided_at`) + status/period checks                      |
| `external-ui/src/components/projects/manage-topups-dialog.tsx`          | Weekly top-up form, paged history and future-week removal                                                                                                                                                                   |
| `external-ui/src/components/projects/review-run-request-dialog.tsx`     | Admin review dialog: asked-for details, usage snapshot, approve/deny decision (runs to grant, new limits, optional note, required deny reason), read-only decided view; exports the shared `formatSentAt`/`formatSentStamp` |
| `external-ui/src/lib/limit-input.ts`                                    | Shared limit parsing/validation for both dialogs (empty input → `null`, annual ≥ weekly, shared bounds)                                                                                                                     |
| `external-ui/src/components/projects/default-limits-dialog.tsx`         | Default-limits dialog: team/personal weekly + annual inputs; PUT full-replace body                                                                                                                                          |
| `external-ui/src/lib/rate-limit.ts`                                     | Effective weekly/yearly limits, status/usage calculations and Vancouver week-key/range helpers                                                                                                                              |
| `helm/_n8n/templates/deployments/worker.yaml`                           | Worker pods receive the custom-database env block                                                                                                                                                                           |

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

Seven tables in the custom database. `0011_add_project_rate_limit_tables.sql` created the rate-limit configuration and the per-project counters; `0013_add_workflow_usage_and_updated_by.sql` added the per-workflow counters and `project_rate_limit.updated_by`; `0014_add_project_topup.sql` adds weekly top-ups; `0015_add_project_rate_limit_default.sql` adds the per-scope defaults table; `0019_add_run_request_decision.sql` adds the decision columns on `rate_limit_request` (what an admin granted/decided and who decided it). These are additive-only migrations, applied by the existing `node migrate.cjs` step. The workflow-usage migration was renumbered from 0012 to 0013 during the CCP-6033 merge because main claimed the 0012 slot.

### `project_rate_limit` — per-project configuration

| Column                    | Type         | Constraints                                                                     | Meaning                                                                                                                                                                                |
| ------------------------- | ------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_id`              | varchar(50)  | primary key                                                                     | n8n project id                                                                                                                                                                         |
| `uses_default_limits`     | boolean      | `NOT NULL DEFAULT true` (migration 0016 backfills pre-existing rows to `false`) | `true` = the project follows its scope's saved defaults and the row's limit values are inert (the write path stores nulls); `false` = the row's values are the project's custom limits |
| `weekly_rate_limit`       | integer      | nullable                                                                        | Custom executions per ISO week, before top-ups; `NULL` = unlimited                                                                                                                     |
| `yearly_rate_limit`       | integer      | nullable                                                                        | Custom max executions per calendar year; `NULL` = unlimited                                                                                                                            |
| `last_admin_comment`      | text         | nullable                                                                        | Free-form admin note (≤ 2000 chars enforced by the API); kept in default mode as the audit trail                                                                                       |
| `stop_behavior`           | varchar(20)  | `NOT NULL DEFAULT 'hard_stop'`, CHECK `IN ('hard_stop','soft_stop')`            | What happens when a limit is reached; applied only in custom mode                                                                                                                      |
| `updated_by`              | varchar(255) | nullable                                                                        | Email of the admin who last changed the configuration; `NULL` until the first API-mediated change                                                                                      |
| `created_at`/`updated_at` | timestamptz  | `NOT NULL DEFAULT now()`                                                        | House-convention timestamps; `updated_at` backs the UI's "Changed <date>" display                                                                                                      |

- **Default mode vs custom mode.** `uses_default_limits = true` (the default for newly saved rows) makes the project behave exactly like an unconfigured project: its limits come from the scope defaults and breaches use `hard_stop`, regardless of what the row's limit/stop columns contain (the service normalizes them to nulls/hard stop on save). `false` = custom mode: the row's own values are enforced, with scope defaults filling unset periods (per period). No row at all also means default mode.
- **No row = unconfigured = limited only by the scope defaults.** Runs are always counted (always-count, below).
- **`NULL` limits = unlimited for that period** (in custom mode once the scope defaults are also exhausted).
- **`updated_by` is an email, resolved to a display name at read time.** The API stamps it with the authenticated admin's email when limits change; the endpoints resolve it against n8n's user table ("F. Last", falling back to the raw email, then to `null`), so responses expose `updatedAt` + `updatedByName` instead of a bare address.

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

The **effective weekly limit** is `weeklyRateLimit + weeklyTopupRuns`, where `weeklyTopupRuns` is the sum for the current ISO weekly key. When the effective weekly base is `NULL`, the project remains unlimited for that period: top-ups never create a limit on their own, and no weekly sum is queried.

Top-ups also raise the **yearly limit**: `yearlyRateLimit + yearlyTopupRuns`, where `yearlyTopupRuns` is the sum of all top-ups whose weekly key overlaps the current calendar year (`listWeeklyPeriodKeysOverlappingYearlyPeriod`). Weekly ISO keys and calendar years do not align at the boundary — e.g. ISO week `2026-W01` starts Mon Dec 29, 2025 — and a run's yearly usage is bucketed by its calendar day, so a top-up for a straddling week raises **both** overlapping years' limits. Top-ups never alter usage counters.

### `project_rate_limit_default` — per-scope default limits

| Column                    | Type         | Constraints                                 | Meaning                                                                                 |
| ------------------------- | ------------ | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| `project_kind`            | varchar(20)  | Primary key; CHECK `IN ('team','personal')` | Which scope the row covers — `team` (tenant projects) or `personal` (personal accounts) |
| `weekly_rate_limit`       | integer      | nullable; CHECK `IS NULL OR ≥ 0` when set   | Default base executions per ISO week, before top-ups; `NULL` = no default               |
| `yearly_rate_limit`       | integer      | nullable; CHECK `IS NULL OR ≥ 0` when set   | Default max executions per calendar year; `NULL` = no default                           |
| `updated_by`              | varchar(255) | nullable                                    | Email of the admin who last saved the defaults (trimmed; empty saved as `NULL`)         |
| `created_at`/`updated_at` | timestamptz  | `NOT NULL DEFAULT now()`                    | Convention timestamps                                                                   |

At most **two rows ever exist** — one per `project_kind` (the full-replace PUT writes both scopes in one transaction). **No row or a `NULL` limit means no default for that scope.** A default of `0` is allowed and pauses every uncapped project of that scope, mirroring the per-project limits' `0` semantics. There is no foreign key: the kind mirrors n8n's `project.type`, with unknown/missing types treated as `team` (same as `project-tenant.service.ts`).

### `rate_limit_notification` — send-once notification claims

| Column        | Type        | Constraints                                                                                             | Meaning                                                       |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `id`          | uuid        | Primary key, `gen_random_uuid()`                                                                        | Claim row id                                                  |
| `project_id`  | varchar(50) | `NOT NULL`; part of the unique constraint                                                               | n8n project id                                                |
| `period_key`  | varchar(10) | `NOT NULL`; CHECK weekly `'YYYY-Www'` or yearly `'YYYY'` format                                         | The period the notification is about                          |
| `event_kind`  | varchar(30) | `NOT NULL`; CHECK `IN` the eight enforcement-time kinds (near 50/80, reached soft/hard × weekly/yearly) | Which notification was sent                                   |
| `usage_count` | integer     | `NOT NULL`, CHECK `≥ 0`                                                                                 | The project's counter value when the email was sent (context) |
| `created_at`  | timestamptz | `NOT NULL DEFAULT now()`; indexed for pruning                                                           | When the claim was won                                        |

The **unique constraint on `(project_id, period_key, event_kind)`** is the whole dedup mechanism: notification dispatch inserts the claim first (`ON CONFLICT DO NOTHING`) and only the caller whose insert returns a row sends the email. Rows double as the record of which notifications were sent; old rows are prunable because a pruned period can never be current again. Config-time emails (top-up granted, limits changed) are not claimed — each sends unconditionally. See _Email notifications_ below.

### `rate_limit_request` — member run requests

| Column                    | Type         | Constraints                                                                            | Meaning                                                                           |
| ------------------------- | ------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `id`                      | uuid         | Primary key, `gen_random_uuid()`                                                       | Request id                                                                        |
| `project_id`              | varchar(50)  | `NOT NULL`; partial unique index where `status = 'pending'`                            | n8n project id — **at most one pending request per project**                      |
| `request_kind`            | varchar(30)  | `NOT NULL`; CHECK `IN ('extra_runs','limit_increase')`                                 | One-week top-up ask or lasting limit raise                                        |
| `extra_runs`              | integer      | nullable; CHECK `≥ 0` (`extra_runs` kind only)                                         | Requested one-off runs (100–50,000, enforced by the service)                      |
| `period_key`              | varchar(10)  | nullable; CHECK weekly `'YYYY-Www'` format (`extra_runs` kind only)                    | Target week of the extra runs (current week + 8 ahead, enforced by the service)   |
| `requested_weekly_limit`  | integer      | nullable; CHECK `≥ 1` (`limit_increase` kind)                                          | Proposed weekly limit; `NULL` = leave unchanged                                   |
| `requested_annual_limit`  | integer      | nullable; CHECK `≥ 1` (`limit_increase` kind)                                          | Proposed annual limit; `NULL` = leave unchanged; ≥ weekly when both set           |
| `reason`                  | varchar(500) | `NOT NULL`; CHECK `length ≥ 1`                                                         | Free-text justification shown to the reviewing admin                              |
| `status`                  | varchar(20)  | `NOT NULL DEFAULT 'pending'`; CHECK `IN ('pending','approved','rejected','cancelled')` | Lifecycle; `cancelled` is member-initiated, `approved`/`rejected` admin decisions |
| `requested_by`            | varchar(36)  | `NOT NULL`                                                                             | n8n user id of the requesting member                                              |
| `granted_runs`            | integer      | nullable; CHECK `≥ 1` (`extra_runs` kind, approved)                                    | Runs actually granted (≤ the ask, enforced by the service)                        |
| `decided_weekly_limit`    | integer      | nullable; CHECK `≥ 1` (`limit_increase` kind, approved)                                | Weekly limit in force after approval; `NULL` = unchanged/not approved             |
| `decided_annual_limit`    | integer      | nullable; CHECK `≥ 1` (`limit_increase` kind, approved)                                | Annual limit in force after approval; `NULL` = unchanged/not approved             |
| `decision_note`           | varchar(500) | nullable                                                                               | Admin note on approval, or the deny reason shown to the requester verbatim        |
| `decided_by`              | varchar(255) | nullable                                                                               | n8n user id of the deciding admin                                                 |
| `decided_at`              | timestamptz  | nullable                                                                               | Decision timestamp                                                                |
| `created_at`/`updated_at` | timestamptz  | `NOT NULL DEFAULT now()`; `(project_id, created_at)` indexed                           | Convention timestamps                                                             |

The **partial unique index on `project_id` where `status = 'pending'`** enforces one in-review request per project at the storage layer: a duplicate submit fails with 23505 and the service surfaces it as **409**, so concurrent submissions can never both queue. Filing requires the same membership the UI button uses (`project:admin` / `project:editor` / `project:personalOwner` — derived from the project relation, never from admin status). The fulfillment flow (an admin approving → top-up grant or limit change, with the review inbox and decision emails) ships with the request & approval system; until then pending requests simply wait and members may cancel their own.

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
2. Loads the project's configuration row and the current weekly/yearly counters, and resolves the effective base limits exactly as the UI displays them. **Default mode** (`uses_default_limits`, also for projects with no row): the row's own values are ignored and the scope's saved defaults (`project_rate_limit_default`; the scope is n8n's `project.type`, `team` for unknown types) are the base for both periods. **Custom mode**: the row's own values win, and scope defaults fill any unset period. The project-kind lookup and the defaults read run only while a scope default can matter. When a weekly base remains, the current weekly key's top-up sum is fetched; when a yearly base remains, the sum of all weekly top-ups overlapping the current year is fetched.
3. Evaluates breaches: weekly `count >= weekly base + current-week top-ups`; yearly `count >= yearly base + in-year top-ups`. `NULL` effective limits are ignored. A yearly limit of `0` (with no top-ups), or a weekly base of `0` without top-ups, rejects every non-exempt run.
4. Derives the notification events (reached per stop behaviour; otherwise the highest crossed near-limit threshold — see _Email notifications_ below) and spawns the fire-and-forget email dispatch **before** a hard-stop throw.
5. Applies the stop behaviour and — when allowed and this process counts — increments the project's weekly/yearly counters and the workflow's counters in the same pass.

### Rules

- **Check-then-increment; rejected runs never count.** A hard-stop breach throws **before** any increment, so rejected runs do not consume budget.
- **`hard_stop`** throws `RateLimitExceededError` and n8n aborts the run. The message is admin- and user-readable, e.g. `Weekly execution limit reached for project '<id>' (limit 5000, used 5000 in 2026-W44). Execution rejected; contact the platform team to adjust rate limits.`
- **Top-up-aware breach messages.** With a base of 5,000 and 2,000 current-week top-up runs, the limit clause is `limit 7000 (base 5000 + 2000 top-up)`. The same formatting applies to a yearly breach whose aggregated in-year top-up sum is positive; without top-ups, the plain `limit 5000` form is unchanged.
- **`soft_stop`** logs a warning and allows the run (still counted).
- **Always-count.** Unconfigured and unlimited projects still accumulate usage on the counting process, so the admin list shows real usage for every project.
- **Exempt modes are neither counted nor blocked:** `manual` (editor runs), `internal`, and n8n evaluation modes (`evaluation*`, `eval_*`).
- **Sub-workflow executions count as runs.** `preExecute` also fires for sub-executions, and each is a real execution counting against the same project's limits.
- **Per-workflow counters mirror the project counters.** Every counted run also increments the `(project, workflow)` rows, so the admin detail page shows per-workflow weekly/annual usage from real counter data. The matrix above applies to both levels.
- **Boundary race.** The check and the increment are not one serialized transaction, so a burst of concurrent runs can overshoot a limit by a few executions. Accepted trade-off — the alternative would serialize all of a project's runs.
- **Fail-open.** Any infrastructure error (custom DB unreachable, missing env, service build failure) is logged and the run is allowed. Only `RateLimitExceededError` propagates out of the hook.
- **No unnecessary enforcement lookup.** Top-up sums are queried only while an effective weekly or yearly base exists (own configuration or a scope default); each period's sum is queried only when that period is capped. The project-kind lookup and the defaults read run only while a scope default can matter. Lookup failures follow the same fail-open policy as other enforcement infrastructure failures.
- **Default limits apply live.** Saving a scope default starts capping the projects that follow defaults (no row, or `uses_default_limits = true`) on their very next run — there is no grandfathering. A project opts out by switching to custom mode (`uses_default_limits = false` with its own values); clearing a default (saving `null`) uncaps default-mode projects again without touching per-project rows.
- **Stop behaviour for default-based breaches.** Custom-mode projects apply their row's `stopBehavior` (a custom row may keep `soft_stop` even when one of its periods falls back to a default). Default-mode projects behave like unconfigured projects: breaches use the default `hard_stop`, and the row's stored stop value is ignored (the write path normalizes it to `hard_stop` anyway).
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

## Email notifications

Rate-limit events notify the people affected by email, reusing the access-request mail pipeline (n8n's `NodeMailer` from the DI container, Handlebars templates in `email-templates.ts`, fire-and-forget sends that never break enforcement or an API request).

### Events

| Event kind                          | Fires when                                   | Recipients                               | Deduplicated per           |
| ----------------------------------- | -------------------------------------------- | ---------------------------------------- | -------------------------- |
| `weekly_reached_hard`               | First run rejected by the weekly limit       | Project admins/editors + platform admins | project + week             |
| `weekly_reached_soft`               | First run at/over the weekly soft limit      | Project admins/editors                   | project + week             |
| `yearly_reached_hard`               | First run rejected by the yearly limit       | Project admins/editors + platform admins | project + year             |
| `yearly_reached_soft`               | First run at/over the yearly soft limit      | Project admins/editors                   | project + year             |
| `weekly_near_80` / `weekly_near_50` | First run past 80% / 50% of the weekly limit | Project admins/editors                   | project + week             |
| `yearly_near_80` / `yearly_near_50` | First run past 80% / 50% of the yearly limit | Project admins/editors                   | project + year             |
| `topup_granted` (no claim row)      | Admin adds a top-up                          | Project admins/editors                   | — (one email per grant)    |
| `limits_changed` (no claim row)     | Admin saves the project's limits             | Project admins/editors                   | — (one email per save)     |
| run request decided (no claim row)  | Admin approves or denies a run request       | The requester only                       | — (one email per decision) |

- **Recipients.** Project admins and editors — n8n relations with role slug `project:admin` or `project:editor`, plus `project:personalOwner` (a personal project's owner is its only member). Disabled users and users without an email are skipped. Platform admins (global owner/admin, via `findAdminEmails`) are added **only for hard-stop reached events** — a fully paused project is an incident. Soft-stop and near-limit emails go to the project's admins/editors only.
- **Percentages use the effective limit** (base + top-ups), matching the UI banner. Default-capped projects get the same emails — their effective limits come from the scope defaults, with no special casing.
- **Highest severity wins per period.** A run that jumps past 50% straight to 85% claims only `*_near_80`; a reached event always beats a near one (they are mutually exclusive per run anyway: near requires `count < limit`).
- **Email content** mirrors the detail-page banner: project name, used vs effective limit (with a top-up note when top-ups contribute), what happens next (hard stop: "New workflow runs are paused until the limit resets on \<date\>", soft stop: "Runs continue in the meantime, and the platform team has been alerted", near: what happens at the limit), and a link to the project page. Reset dates and week ranges are rendered in the period timezone (`getNextWeeklyReset` / `getNextYearlyReset` / `describeWeeklyPeriodKey`).

### Deduplication and delivery semantics

- **Claim-by-insert.** Enforcement-time events are claimed in `rate_limit_notification` (unique on `(project_id, period_key, event_kind)`): `INSERT … ON CONFLICT DO NOTHING` returning the row — the winner sends, losers stay silent. Concurrent runs (also across processes: queue-mode main and a worker can both detect the same breach) can therefore never double-send.
- **Send-once.** A failed SMTP send **keeps** the claim — no retries (that would risk spamming on persistent SMTP outages); the failure is logged. The next period gets fresh claims.
- **Fire-and-forget.** The dispatch is spawned (`void`) before a hard-stop throw and never awaited by enforcement: SMTP latency never delays a run, and a rejected run still triggers its notification.
- **Notifications are optional.** Without a mailer (nullable `NodeMailerService` — e.g. a worker process where n8n did not register the mailer), the service skips sending entirely; enforcement is unaffected. Claims only exist when an email is actually attempted.
- **Config-time emails are not claimed** — each top-up grant or limits save is a deliberate admin action and sends one email. They fire from the main-process API path, where the mailer is always available.
- **Run-request decision emails** go to the requester only, fire once per decision (`notifyRunRequestDecided`), and pick one of three templates: `rateLimitRequestTopupApproved` (granted amount + week + optional admin note), `rateLimitRequestLimitsApproved` (the new weekly/annual limits, "unchanged" for untouched periods, + note) or `rateLimitRequestDenied` (the deny reason verbatim). Each carries the deciding admin's display name and a link to the project page. If the requester's email cannot be resolved the decision still succeeds and the skip is logged.
- **Retention.** `pruneOlderThan` deletes old claim rows (they double as the sent-record); pruning is safe because a pruned period can never be current again.

### Operational notes for notifications

- **Apply migration `0017` with the notifications release.** Until it is applied, `rate_limit_notification` inserts fail at the custom-DB layer; the dispatch catches the error and logs it — enforcement and the API are unaffected, but no notification emails are sent and every run re-attempts (log noise only).
- **Emails trigger on run activity.** Enforcement sees counts only when a workflow runs, so a project that stops running at 40% never receives a near-50 email. There is no scheduler in the hooks.
- **SMTP must reach the process that detects the breach.** In queue mode, breaches can first be detected in main (pre-check) or the worker; both inherit the shared `n8n.env` SMTP settings in the helm chart, so both can send.
- **The kill switch also kills notifications**: with `RATE_LIMIT_ENFORCEMENT_ENABLED=false` the hook returns before evaluating anything, so no enforcement-time emails are sent (config-time emails are unrelated to the kill switch).

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

## Projects API

Reads and writes are split by audience. **Read endpoints** (list, detail, workflow usage, top-up history) live on a shared router mounted at **`/ui-api/projects`** and serve admins and non-admins alike — the mount enforces the UI session + `canManageProject`, and the handlers branch on the session's admin flag: admins get every n8n project, members get only the projects they can access in n8n (their personal project plus team project relations), with identical payloads. **Write endpoints** (limits, tenant mapping, top-up create/delete, defaults) remain on **`/ui-api/admin`** behind the full guard chain (`requireUiRequestContext` + `canManageProject` + `global:owner`/`global:admin`), so a non-admin can never reach them regardless of the UI. (The `/rest/admin/...` prefixes still present in some source JSDoc comments are legacy — `/ui-api/...` is the real path.)

The run-request review endpoints sit on the same admin router: `GET /ui-api/admin/projects/run-requests` (query: `status` — `pending` default / `approved` / `denied` / `cancelled` / `all`, `search`, `page`, `pageSize`; pending rows come back oldest-first, the rest newest-first, with a `pending` block for the stat tile), `POST /ui-api/admin/projects/run-requests/:id/approve` (body: `grantedRuns` for extra_runs — defaults to the ask, may be lowered, never raised — and `newWeeklyLimit`/`newAnnualLimit` for limit_increase, plus optional `note`) and `POST /ui-api/admin/projects/run-requests/:id/deny` (body: `reason`, 10–500 chars, shown to the requester verbatim). Deciding an already-decided or cancelled request returns **409**.

The **list** is also exposed member-side on the shared router as `GET /ui-api/projects/run-requests` (registered ahead of `/:projectId`, same query parameters and payload): admins get the full review queue, members get only requests belonging to the projects they can access in n8n, and the `pending` block is scoped the same way. Decisions stay admin-only.

### `GET /ui-api/projects`

Query parameters: `page` (default 1), `pageSize` (default 25, max 100), `search`, `type` (`team`/`personal`). Each item keeps `projectId`, `projectName`, `projectType`, `tenantId` and:

| Field                  | Type                               | Meaning                                                                                                                                                    |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usesDefaultLimits`    | boolean                            | `true` when the project follows its scope's saved defaults (no row counts as `true`)                                                                       |
| `weeklyRateLimit`      | number \| null                     | **Effective enforced weekly base**: scope default in default mode, else the custom value (per period falling back to the scope default); `null` = uncapped |
| `yearlyRateLimit`      | number \| null                     | **Effective enforced yearly base**, resolved the same way; `null` = uncapped                                                                               |
| `stopBehavior`         | 'hard_stop' \| 'soft_stop' \| null | Custom stop behavior; `null` in default mode (hard stop applies) or when unconfigured                                                                      |
| `lastAdminComment`     | string \| null                     | Last admin note; `null` when unset                                                                                                                         |
| `weeklyExecutionCount` | number                             | Executions in the current ISO week (0 default)                                                                                                             |
| `yearlyExecutionCount` | number                             | Executions in the current calendar year (0 default)                                                                                                        |
| `weeklyTopupRuns`      | number                             | Sum of top-up amounts for the current ISO week (0 default)                                                                                                 |
| `yearlyTopupRuns`      | number                             | Sum of top-up amounts whose weeks overlap the current calendar year (0 default)                                                                            |
| `workflowCount`        | number                             | Workflows shared with the project (0 default)                                                                                                              |
| `membersCount`         | number                             | Project members, from n8n's project relations (0 default)                                                                                                  |
| `updatedAt`            | string \| null                     | When the rate-limit config was last changed (ISO 8601); `null` when never changed                                                                          |
| `updatedByName`        | string \| null                     | Display name of the admin who made the last change; `null` when unknown                                                                                    |

Example item (inside the usual `{ "data": [...], "pagination": { ... } }` envelope):

```json
{
  "projectId": "pKQ8pX7cQFdB",
  "projectName": "Example project",
  "projectType": "team",
  "tenantId": null,
  "usesDefaultLimits": false,
  "weeklyRateLimit": 5000,
  "yearlyRateLimit": 200000,
  "stopBehavior": "hard_stop",
  "lastAdminComment": "Tier A pilot limits",
  "weeklyExecutionCount": 12,
  "yearlyExecutionCount": 340,
  "weeklyTopupRuns": 2000,
  "yearlyTopupRuns": 4000,
  "workflowCount": 4,
  "membersCount": 6,
  "updatedAt": "2026-10-26T23:01:02.345Z",
  "updatedByName": "N. McInnis"
}
```

`weeklyRateLimit`/`yearlyRateLimit` are the **effective enforced bases** — they already include the scope-default resolution, matching enforcement exactly, so default-mode projects show the default numbers (with `usesDefaultLimits: true` as the provenance marker) instead of a misleading "No limit set". Clients add `weeklyTopupRuns`/`yearlyTopupRuns` to get the final ceilings. Sums are returned even when the matching base is null, but have no effect until a base exists.

**Errors never break the list:** enrichment failures (e.g. custom-DB outage) are logged and fall back to defaults — default mode, `null` limits/comment, `0` counts/top-up runs, `null` `updatedAt`/`updatedByName` — so the project list keeps working.

**Member scoping:** for non-admins the list is restricted in SQL to the project ids the user can access in n8n (`listProjectIdsAccessibleToUser` — personal project + team project relations); a member of no project gets an empty page. All other enrichment is identical.

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

### `GET /ui-api/projects/:projectId`

Same item shape as the list, enrichment included — plus `viewerRole`, the requesting user's n8n project role for the project (`project:admin` / `project:editor` / `project:viewer` / `project:personalOwner`), or `null` when they are not a member (including platform admins without a relation; the field is derived from the project relation only, never from admin status) — and `pendingRunRequest`, the project's pending member request (see below), or `null` when none is open. Both fields are detail-only; the list endpoint never sets them. Backs the project detail page for admins and members — the role-scoped member affordances (the "Request more runs" action, the "You are an editor" meta label, the pending-review panel) key off these fields. Admins may read any project; a non-admin gets **403** unless they can access the project in n8n (project relation or personal-project owner). **404** (`Project not found`) when the project does not exist.

#### `GET /ui-api/projects/run-requests`

Member-visible request list backing the Projects page's "Run requests" tab (the admin route above stays for the review queue; the UI calls this one for both audiences). Same query parameters, item shape and ordering as the admin list; admins get every request, non-admins only those belonging to projects they can access in n8n (`listProjectIdsAccessibleToUser` — personal project plus team relations; members of no project get an empty page without touching the request table). The `pending` block is scoped identically, so the tab count reflects the member's projects only.

#### `POST /ui-api/projects/:projectId/run-requests`

Files a member run request. Body: `{ requestKind: 'extra_runs' | 'limit_increase', extraRuns?, periodKey?, requestedWeeklyLimit?, requestedAnnualLimit?, reason }`. Field bounds mirror the dialog (extra runs 100–50,000; reason 1–500; limits 1–1,000,000 weekly / 100,000,000 annual); the service enforces kind/field coherence, the current-week-plus-8 horizon and the annual ≥ weekly rule as **400**s, unknown projects as **404**, non-eligible viewers (not a project admin/editor/personal owner) as **403**, and an already-pending request (including a concurrent submit racing the insert) as **409**. **201** with `{ success: true, message: 'Run request submitted', request: <pendingRunRequest summary> }`.

#### `DELETE /ui-api/projects/:projectId/run-requests/:requestId`

Cancels the requester's own pending request (ownership + pending status are part of the update's WHERE clause; anything else is indistinguishable to the caller and answers **404**). Members pass the same project-access assertion as the reads; **204** on success.

### `GET /ui-api/projects/:projectId/workflow-usage`

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

Counts come from `workflow_execution_usage` (custom DB), sorted by workflow name. Usage rows whose workflow is no longer shared with the project are excluded. Non-admins are subject to the same project-access check as the detail endpoint (**403** otherwise). **404** (`Project not found`) when the project is unknown.

### `PUT /ui-api/admin/projects/:projectId/rate-limit`

Full-replace semantics, aligned with the tenant endpoints: **every body field is required**; an explicit `null` clears a limit or the comment.

| Field               | Validation                                                                    |
| ------------------- | ----------------------------------------------------------------------------- |
| `usesDefaultLimits` | boolean (required); `true` switches the project to its scope's saved defaults |
| `weeklyRateLimit`   | integer, `0`–`1,000,000`, or `null` (clears)                                  |
| `yearlyRateLimit`   | integer, `0`–`100,000,000`, or `null` (clears)                                |
| `lastAdminComment`  | string ≤ 2000 chars, or `null` (clears)                                       |
| `stopBehavior`      | `'hard_stop'` or `'soft_stop'` (required, never null)                         |

Example request body:

```json
{
  "usesDefaultLimits": false,
  "weeklyRateLimit": 5000,
  "yearlyRateLimit": 200000,
  "lastAdminComment": "Tier A pilot limits",
  "stopBehavior": "hard_stop"
}
```

With `usesDefaultLimits: true` the service normalizes the stored row to the unconfigured shape — limits `null`, `stopBehavior` `'hard_stop'` — and keeps only the comment as the audit trail; the response echoes the normalized row. Enforcement then resolves both periods from the scope defaults.

**200** response (`rateLimit` is the stored row; `updatedBy` records the authenticated admin's email, from the UI session):

```json
{
  "success": true,
  "message": "Rate limit updated",
  "rateLimit": {
    "projectId": "pKQ8pX7cQFdB",
    "usesDefaultLimits": false,
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

### `GET /ui-api/projects/:projectId/topups`

Lists a project's stored top-ups, including past, current and future weeks, ordered by **`period_key DESC, created_at DESC`** (latest target week first, newest grant first within a week). Non-admins are subject to the same project-access check as the detail endpoint.

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

## Projects pages (admin and member views)

The external-ui **Projects** page (`/projects`) renders this API data for platform admins: aggregate stat cards (runs this week, limit reached, near limit, no limit), Tenants / Personal accounts tabs, client-side search + status filter over the full project list (fetched in pages of 100), and a usage table with weekly/annual progress bars, status badges and per-project links. Status and bar tones are computed client-side: reached = count ≥ limit; near = ≥ 80% of any set limit; red at ≥ 100%, amber at ≥ 75%. Weekly and yearly comparisons/bars both use the effective limit (base plus the matching top-up sum).

**Non-admins see the same pages read-only.** Both routes were already gated by `canManageProject` rather than admin role, so the pages render for every eligible user with a `readOnly` prop when the session is not an admin: the same table, stat cards, tabs, filters and usage bars, but the **Default limits** button is admin-only (hidden, and the defaults endpoints are never called), the row link reads **View** instead of **Manage**, and the detail page drops the tenant-ID editor, **Edit tenant limits** and **Manage top-ups** buttons (and their dialogs), gaining the role-scoped **Request more runs** action instead (see below). The shared endpoints scope a member's list to their own projects server-side; opening another project's URL by hand renders a "No access to this project" card (403).

Each row links to a per-project detail page (`/projects/:projectId`): limit cards with "Changed <date> by <name>" attribution (`updatedAt`/`updatedByName`), reset dates (next Monday / Jan 1, `America/Vancouver`), a member count from the project's relations, a per-workflow runs table from the workflow-usage endpoint, tenant-ID inline editing (admins only), and an "Edit limits" dialog with a **Use default limits** toggle (default mode shows the scope defaults read-only; custom mode offers weekly/annual limits, stop behaviour and a required reason) that PUTs the full-replace body.

The weekly card uses the effective limit and shows `Includes +N top-up` only when current-week top-ups are positive; the annual card does the same with the aggregated in-year top-up sum. A `Default` badge on a list cell or limit card marks a limit that comes from the scope defaults. The near/reached banner describes what happens next instead of repeating the top-up line (which lives on the limit cards): for a **near-limit week** it projects the pause date from the current pace — "At this pace new runs pause on Friday, Nov 6" — falling back to plain wording ("New runs pause once you reach your weekly limit of 5,000.") when there is no meaningful projection (no usage yet, the week just started, or the pace won't reach the limit within the week); yearly near-limits always use the plain wording. Reached banners keep their stop-behaviour sentence in the title. Every banner state closes with the request call to action: "If your team needs more, request extra runs for this week or a higher limit."

**Member request entry point.** In the member view, the detail page shows a **Request more runs** header button whenever the viewer's project role (`viewerRole` from the detail endpoint) is `project:admin`, `project:editor` or `project:personalOwner` (a personal project's owner is its sole member and, like admins and editors, cannot raise limits themselves). Visibility is membership-based and independent of current usage — unlike the near/reached banner, it is not tied to the 80% threshold, so members can request a raise or top-up before hitting the wall. Platform admins without a project relation get `viewerRole: null` and never see the button, and the admin view keeps the direct **Manage top-ups** / **Edit limits** controls instead. The meta line shows "You are an editor" / "You are an admin" / "You are a viewer" / "You are the owner" whenever the viewer is a member.

The button opens the **request form** (see _Member run requests_ below): a one-week top-up ask or a lasting limit raise, with the project's current usage for context. While a request is pending, the detail page shows the pending-review panel with a **Cancel request** action, the banner closes with "Your request for … is waiting for review." instead of the generic call to action, and the weekly limit card notes "+N requested, waiting for review".

The **Manage top-ups** header button opens **Manage top-ups for <project>**:

- **Period** offers the current week (`This week (Oct 26 to Nov 1)`) plus 25 coming weeks, labelled by date range without a `Weekly` prefix.
- **Top-up amount** accepts whole runs (commas/spaces tolerated); **Comment** is required and saved with the grant. The limit summary includes current-week top-ups and, when no weekly limit is configured, explains that a top-up would only affect the annual limit. The dialog description notes that top-ups also raise the annual limit for the year the target week falls in.
- **Cancel / Add top-up** sit directly below the admin comment, above the separator and history. Successful creation keeps the dialog and selected period open, clears the amount/comment, and refreshes history plus the project list/detail queries. Background project refetches do not wipe an in-progress entry.
- **History** is paged four rows at a time, in API order. Columns are Amount, Added, **Week** (the Monday–Sunday date range), Comment and actions; there is no separate Period or Ends column. Only future-week rows show a removal action, which requires confirmation.

The **Default limits** header button on the Projects list opens a dialog with two fieldsets — **Team projects (tenants)** and **Personal accounts** — each seeding widget-style weekly + annual inputs from the saved defaults. Empty input means "no default": saving blank fields stores `null` and leaves that scope's uncapped projects uncapped. Validation matches the per-project dialog (whole numbers with commas tolerated, shared API bounds, annual ≥ weekly per scope) and reports errors inline per field. **Cancel** discards, **Save defaults** PUTs the full-replace body and closes; there is no reset action, and no usage counts are fetched or shown.

The list-page period selector remains current-period-only, and historical usage browsing is not implemented. The list and detail pages show the **effective enforced limits** (scope defaults included) with a `Default` badge marking default-sourced limits, so a team project capped only by the team default displays the default numbers instead of "No limit set".

---

## Operational notes

- **Roll out the image and the helm worker env in the same release.** The enforcement hook ships in the image, but workers also need `CUSTOM_DATABASE_URL` (now injected from the `customDatabase` secret, mirroring main's block). A worker without it logs one error — `Rate limiting disabled in this process: CUSTOM_DATABASE_URL is not set` — and stays fail-open for the life of the pod: nothing is enforced **or counted** for queue runs.
- **Apply migration `0014` with the top-up backend/UI release** using the existing provision step. Weekly enforcement and admin enrichment read `project_topup`; a missing table follows the existing fail-open/default-enrichment behavior. Before production, smoke-test current-week sums, automatic future-week activation and worker-side queue enforcement in a dev namespace.
- **Apply migration `0015` with the defaults release.** Until it is applied, the defaults endpoints fail at the custom-DB layer (`GET` returns a 500) and enforcement treats the unusable defaults lookup as an infrastructure failure and fails open — explicitly configured projects are unaffected, nothing is rejected by defaults before the migration lands.
- **Apply migration `0016` with the default-mode release.** Until it is applied, reads referencing `project_rate_limit.uses_default_limits` fail at the custom-DB layer (enforcement fails open; the list degrades to default enrichment). The migration is additive (`ADD COLUMN … DEFAULT true`) plus a one-time backfill that marks all pre-existing rows as custom mode (`false`), preserving their enforced values exactly.
- **Apply migration `0017` with the notifications release.** Until it is applied, notification claim inserts fail at the custom-DB layer; the dispatch catches and logs the failure — enforcement, counting and the API are unaffected, but no emails are sent (see _Operational notes for notifications_ above).
- **Saving defaults starts capping today's uncapped projects.** There is no grandfathering: the next run of any default-mode project (no row, or `uses_default_limits = true`) is governed by the new default. To walk it back, save the fields empty (which stores `null`, no default) — the defaults dialog never touches per-project rows. A default of `0` pauses every default-mode project of the scope.
- **Default limits stay enforced in queue mode** exactly like configured limits (worker-side counting and rejection); the existing worker-env + migration smoke test covers default-based caps as well.
- **Yearly top-up aggregation needs no migration.** It is derived from the existing weekly `period_key` rows (`listWeeklyPeriodKeysOverlappingYearlyPeriod`); deploying the code alone activates it. Top-ups granted for weeks that overlap two calendar years raise both years' limits.
- **Kill switch:** `RATE_LIMIT_ENFORCEMENT_ENABLED=false` stops all enforcement; it takes effect after a process restart (env is read once at startup).
- **Safe rollout by default:** with no `project_rate_limit` rows configured, nothing is ever rejected; usage counters still accumulate — exactly what you want before picking limits, since the admin list then shows real usage for every project.
- **Counters survive n8n's execution pruning by design.** n8n prunes its own execution records after a deployment-configured age — this repo's helm sets `EXECUTIONS_DATA_PRUNE: "true"` with `EXECUTIONS_DATA_MAX_AGE: "336"` (hours ≈ 14 days) in the base values, and `8784` (1 year) in the prod values files — so counting live `execution_entity` rows would silently undercount yearly usage. The dedicated counter rows in the custom DB are unaffected.
- **Old period rows accumulate slowly** — one row per project (plus one per project/workflow) per period; a weekly row stops being read at the next week rollover. Retention/cleanup is a follow-up (explicit non-goal of the initial release).
- **Resumed (waiting) executions** may re-fire the pre-run hook on the worker; if n8n does so, a resumed run adds one extra usage increment. Upstream behaviour is not yet confirmed; the possible overcount is accepted.

---

## n8n upgrade caveat

This feature depends on verified `n8n@2.36.2` behaviour: `workflow.preExecute` fires on `workflowExecuteBefore` in main (regular and queue mode), in workers and for sub-executions; a throwing hook aborts the run, and on main an editor-initiated run is aborted **before** its execution record is created. **n8n 3.x changes `preExecute` error/record semantics and removes `N8N_PRE_EXECUTE_ERROR_CREATES_EXECUTION`.** On the next n8n upgrade, re-verify hook firing, error propagation and execution-record behaviour — and re-run the rate-limit tests — before shipping.
