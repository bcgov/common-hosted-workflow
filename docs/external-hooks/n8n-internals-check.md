# n8n internals check

`external-hooks` runs inside the n8n process but has **no npm dependency on n8n**. Instead, it
loads a fixed set of n8n's own compiled modules at runtime with `require()` against absolute paths
inside the container (e.g. `/usr/local/lib/node_modules/n8n/dist/workflow-runner.js`). Those
modules give the plugin access to n8n's credential decryption, DI container, repositories, and the
execution engine that powers the WIL Trigger node.

The problem: those paths and their exports are **private n8n internals**, not a stable public API.
An n8n version bump can rename a file, move a class, or drop an export. When that happens, the
`require()` fails at runtime and the affected feature silently degrades:

- Credential-backed features stop working.
- The WIL Trigger runner reports `available = false`, so **every trigger returns `503`** — there is
  no longer a URL/webhook fallback.

Nothing in the normal test suite catches this, because the n8n modules only exist inside the n8n
container, not in CI's plain Node environment. The **n8n internals check** closes that gap: it turns
a silent runtime degradation into a loud, build-time failure.

---

## Source layout

| Path                                                            | Role                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `external-hooks/src/api/constants/n8n-paths.ts`                 | Declares each `N8N_*_PATH` constant and the `N8N_INTERNAL_MODULES` manifest (path → expected exports). |
| `external-hooks/src/api/helpers/n8n-internals-check.ts`         | Pure, loader-injected `verifyN8nInternals(...)` + `formatCheckResult(...)`. No I/O, fully unit-tested. |
| `external-hooks/src/verify-n8n-internals.ts`                    | CLI entrypoint; bundles to `dist/verify-n8n-internals.cjs`. `require()`s each module, exits non-zero.  |
| `external-hooks/tests/api/constants/n8n-paths.contract.test.ts` | Locks the manifest to the path constants and tests the check logic.                                    |
| `docker-compose/docker-compose.yml`                             | `n8n-provision` runs the verifier before `migrate.cjs`, so provisioning fails on an incompatible n8n.  |

---

## How it works

### The manifest is the contract

`N8N_INTERNAL_MODULES` in `n8n-paths.ts` maps every n8n module the plugin requires to the named
exports it reads from that module:

```ts
export const N8N_INTERNAL_MODULES: Record<string, readonly string[]> = {
  [N8N_WORKFLOW_RUNNER_PATH]: ['WorkflowRunner'],
  [N8N_ACTIVE_EXECUTIONS_PATH]: ['ActiveExecutions'],
  [N8N_WORKFLOW_PATH]: ['createRunExecutionData', 'CREDENTIAL_BLANKING_VALUE'],
  // ...one entry per module the code require()s
};
```

This manifest is the single source of truth for "what n8n internals does this build depend on."

### Two layers of protection

**1. Unit test (runs in normal CI, `pnpm test`).** `n8n-paths.contract.test.ts` does **not** touch
the real n8n runtime. It guarantees two things:

- Every `N8N_*_PATH` constant exported from `n8n-paths.ts` appears as a key in the manifest. This
  stops a developer from adding a new `require(N8N_SOMETHING_PATH)` that quietly escapes the guard.
- The `verifyN8nInternals` logic correctly reports a missing module vs. a missing export.

This layer keeps the contract complete and correct. It **cannot** detect that a real n8n module
moved — everything is mocked.

**2. Container smoke check (the actual version guard).** `verify-n8n-internals.ts` runs **inside the
n8n image**, the only place the absolute paths resolve. It walks the manifest, `require()`s each
module, and asserts every expected export exists. It is wired into the `n8n-provision` step in
`docker-compose.yml`, chained with `&&` before the migration:

```sh
cd /external-hooks && node verify-n8n-internals.cjs &&
node migrate.cjs;
```

If the verifier exits non-zero, the `&&` chain stops and **provisioning fails** — a bad base-image
bump is caught at deploy time rather than when a user clicks a trigger.

---

## Running it

The check runs automatically during provisioning. To run it manually inside an n8n container:

```sh
docker compose exec n8n node /external-hooks/verify-n8n-internals.cjs
# or, during provisioning:
docker compose run --rm n8n-provision
```

To run the unit-test layer locally (no container needed):

```sh
cd external-hooks
pnpm test tests/api/constants/n8n-paths.contract.test.ts
```

---

## Interpreting the output

The script prints one line per module, then a summary. Exit code `0` = all resolved, `1` = at least
one failure.

### Success

```
Verifying n8n runtime internals:
  ok    /usr/local/lib/node_modules/n8n/dist/workflow-runner.js
  ok    /usr/local/lib/node_modules/n8n/dist/active-executions.js
  ok    /usr/local/lib/node_modules/n8n/node_modules/n8n-workflow
  ...
All n8n runtime internals resolved.
```

Every module loaded and exposed its expected exports. The build is compatible with the installed
n8n version. Exit code `0`.

### Failure — a module is missing

```
  FAIL  /usr/local/lib/node_modules/n8n/dist/workflow-runner.js — cannot load module: Cannot find module '/usr/local/lib/node_modules/n8n/dist/workflow-runner.js'
```

**Meaning:** the file no longer exists at that path. n8n renamed or moved it in this version.

**What to do:** find where that module lives in the new n8n version, update the corresponding
`N8N_*_PATH` constant in `n8n-paths.ts`, and re-run the check.

### Failure — an export is missing

```
  FAIL  /usr/local/lib/node_modules/n8n/node_modules/n8n-workflow — missing export(s): createRunExecutionData
```

**Meaning:** the module loaded, but one or more expected exports are gone — typically renamed, or the
function's location changed within n8n.

**What to do:** locate the new name/location of that export in the installed n8n version. Update the
manifest entry (and the consuming code in `services.ts` / `n8n-workflow-runner.service.ts`) to match,
then re-run.

### The summary line

```
n8n internals check FAILED for 2 module(s). This build is incompatible with the installed n8n
version. Update src/api/constants/n8n-paths.ts (N8N_INTERNAL_MODULES) to match n8n, then re-verify
the credentials and WIL Trigger runner integration.
```

This is the signal that the n8n base image and this build of `external-hooks` have drifted apart.
Do not ship the build until the manifest and consuming code are reconciled with the new n8n version
and the check passes again.

---

## When a check fails: the fix loop

1. Read the failing lines to see whether it is a **missing module** (path moved) or a **missing
   export** (symbol renamed/relocated).
2. Open the installed n8n version (`/usr/local/lib/node_modules/n8n`) and find the new location or
   name.
3. Update `src/api/constants/n8n-paths.ts` — the `N8N_*_PATH` constant and/or the manifest entry.
4. Update the code that consumes it (`src/api/bootstrap/services.ts`,
   `src/api/services/n8n-workflow-runner.service.ts`) if the usage changed.
5. Re-bundle (`pnpm bundle`) and re-run the verifier in the container until it exits `0`.
6. Add or adjust a unit test if the shape of the dependency changed.

> Re-verify the manifest on **every n8n base-image bump**. The check tells you _that_ something
> broke; reconciling it with n8n is still a manual step.
