# Future Work

This document tracks planned features and enhancements for the Workflow Interaction Layer that are not yet implemented.

---

## 1. Workflow Triggers

### Overview

Workflow triggers allow tenant admins and workflow designers to create entry points that actors can use to invoke workflows directly from the external UI. This turns WIL from a purely reactive system (responding to actions) into a proactive one (initiating workflows).

### Trigger Types

#### Button Triggers

A simple button click that calls a workflow webhook URL to start an execution.

**Concept:**

- Tenant admin / workflow designer registers a trigger (name, description, target webhook URL)
- Eligible actors see the trigger as a button on the UI
- Clicking the button calls the webhook URL (via a server-side proxy, same pattern as the callback proxy)
- The workflow starts execution

**Design Considerations:**

- Triggers must be scoped to a tenant and optionally to specific actors/roles
- The webhook URL must stay server-side (same proxy pattern as callback)
- Need a UI section for browsing available triggers (separate from actions/messages)
- Need a backend endpoint for listing triggers and executing them
- Consider confirmation dialogs to prevent accidental triggers
- Consider rate limiting to prevent webhook spam

#### CHEFS Form Triggers

An embedded CHEFS form that, on submission, triggers a workflow by calling a webhook URL with the submission data.

**Concept:**

- Workflow designer registers a trigger linked to a CHEFS form (form ID + FormAPIKey + webhook URL)
- Actor opens the trigger → CHEFS form is rendered (same ChefsFormViewer component)
- On form submission → submission data is sent to the webhook URL (via proxy)
- The workflow starts execution with the form data as input

**Design Considerations:**

- Reuses the existing CHEFS token exchange and ChefsFormViewer infrastructure
- The webhook payload should include form ID, submission ID, and optionally the full submission data
- Need to decide: does the trigger store a FormAPIKey (like showform actions) or reference a shared credential?
- Prefill data with user context (same pattern as ShowFormHandler)
- Consider whether the trigger should create an action record for tracking, or be fire-and-forget

### Trigger Management

- Tenant admins need CRUD operations for triggers
- Triggers need access control: who can see them, who can execute them
- Possible scoping: public (all actors in tenant), role-based, or individual actor
- UI for trigger management (admin panel or workflow designer interface)

---

## 2. Claim/Unclaim Process

### Overview

Actions assigned to roles or groups (rather than individual actors) need ownership control to prevent conflicts and duplication. The claim process allows an eligible actor to take ownership of a shared action.

### Status Transitions

```
           ┌─────────────────────────────────────────────┐
           │                                             │
           ▼                                             │
  ┌─────────────┐    claim     ┌──────────┐    start   ┌─────────────┐    complete   ┌───────────┐
  │   pending   │────────────▶│  claimed  │──────────▶│ in_progress │──────────────▶│ completed │
  │  (assigned) │             └──────────┘            └─────────────┘              └───────────┘
  └─────────────┘                  │                                                      │
           ▲                       │ unclaim                                              │
           │                       │                                                      │
           └───────────────────────┘                                                      │
                                                                                          │
                                   ┌──────────┐                                           │
                                   │ expired  │◀── scheduler (due_date passed) ───────────┘
                                   └──────────┘    (only if not completed/cancelled)
```

### Acceptance Criteria (Planned)

1. **Unclaimed state:** When no actor has claimed a role/group action, only a "Claim" button is visible. Action interaction buttons (approve, submit, confirm) are hidden.

2. **Claim action:** When an eligible actor claims the action:
   - `claimedBy` and `claimedAt` fields are populated
   - Status transitions to `claimed`
   - The claiming actor can now see and use interaction buttons

3. **Visibility for others:** Other eligible actors can view the action as "claimed by [name]" but cannot interact with it.

4. **Start action:** When the claiming actor begins work, status changes to `in_progress`.

5. **Complete action:** On completion, `completedBy` and `completedAt` are populated.

6. **Unclaim:** Any eligible actor can unclaim an action, clearing claim fields and returning it to `pending/assigned`. This enables transfer of ownership.

7. **Expiry:** If due date passes without completion, status transitions to `expired` (handled by scheduler — see section 3).

### Dependencies & Risks

| Type       | Detail                                                                            |
| ---------- | --------------------------------------------------------------------------------- |
| Dependency | WIL actor definitions (role/group configuration via tenant)                       |
| Dependency | CSTAR integration for dynamic group resolution                                    |
| Risk       | Concurrent claim/unclaim conflicts — need locking or atomic DB updates            |
| Risk       | Unclear permissions on who can unclaim (only claimer? any eligible actor? admin?) |

### Implementation Considerations

- New DB columns on `action_requests`: `claimedBy`, `claimedAt`, `completedBy`, `completedAt`
- New status value: `claimed` (between `pending` and `in_progress`)
- Backend: atomic claim operation (compare-and-swap or row-level lock)
- Frontend: conditional rendering of Claim/Unclaim button vs interaction buttons
- WebSocket or polling for real-time claim status visibility to other actors

---

## 3. Auto-Expire Overdue Actions

### Overview

Actions with a `due_date` in the past should automatically transition to `expired` status without manual intervention. This keeps action statuses accurate and removes stale items from active queues.

### Scheduler Design

A background job that runs at a defined interval (e.g., every 5–15 minutes):

```sql
UPDATE action_requests
SET status = 'expired', updated_at = NOW()
WHERE due_date < NOW()
  AND status NOT IN ('completed', 'cancelled', 'expired', 'archived')
```

### Acceptance Criteria (Planned)

1. Actions with `due_date < current time` and status not in `[completed, cancelled, expired, archived]` are updated to `expired`
2. Scheduler runs automatically at a defined interval
3. Update operation is atomic and applied directly via SQL
4. Actions already in terminal states are not modified
5. System connects to PostgreSQL before executing update
6. DB connection failures are logged and do not crash the scheduler
7. Scheduler is idempotent (safe to run concurrently or multiple times)

### Implementation Considerations

- Could run as: n8n cron workflow, standalone Node.js cron job, or pg_cron extension
- Must handle gracefully: DB connection loss, long-running queries, partial failures
- Consider batch size limits to avoid locking large numbers of rows
- Logging: record how many actions were expired per run
- Alerting: if expiry count exceeds a threshold, something may be wrong upstream

---

## 4. Submission Updates (Edit Existing Submissions)

### Current State

All form interactions currently create a **new** submission in CHEFS. The `submissionId` field in the action payload is wired through to the `ChefsFormViewer` component, but the WIL flow does not yet support editing/updating an existing submission.

### Planned Enhancement

Allow actions to reference an existing submission that the actor should update (rather than create new):

```typescript
// Action payload for edit mode:
{
  formId: "...",
  formName: "...",
  formApiKey: "...",
  submissionId: "existing-submission-uuid",  // ← edit this submission
  formPreFillData: { ... }                   // ← optional overrides
}
```

### Open Questions

- Does CHEFS support editing a submission via the web component with `submission-id` attribute + write-mode auth token?
- Should the action track version/revision of the submission?
- How to handle conflicts if two actors try to edit the same submission?
- Should we show a diff or history of changes?
- Does the callback body change for edits vs new submissions?

### CHEFS Capabilities to Explore

- `submission-id` attribute on `<chefs-form-viewer>` loads existing data
- Need to confirm: does submitting with `submission-id` update in place or create a new revision?
- May need different auth token scope for edit vs create
- May need `read-only` attribute for view-only completed submissions

---

## 5. CSTAR Integration

### Current State

Tenant access is resolved via the `tenant_project_relation` table with a placeholder access check (always returns true). Tenant names come from the same table.

### Planned Enhancement

Integrate with the CSTAR (Common Services Tenant Administration Registry) API to:

1. **Resolve tenant membership per user** — only show tenants the user actually belongs to
2. **Get real tenant display names** — instead of storing names locally
3. **Dynamic group resolution** — resolve role/group membership for claim-based actions
4. **Tenant access verification** — validate the user has permission for the requested tenant

### Impact Points

```typescript
// In resolveWilTenantProjectIds (currently has TODO):
// TODO: Integrate CSTAR API for tenant access verification

// In GET /tenants (currently reads all from DB):
// TODO: Replace with CSTAR API integration to resolve tenants per user
```

---

## 6. Role-Based Actor Matching

### Current State

Actions are matched to users by a simple string comparison:

- Primary: `actorId === session.email`
- Fallback: `actorId === session.subject`

### Planned Enhancement

Support role-based and group-based actor assignment:

```typescript
// Current:
actorId: 'user@gov.bc.ca'; // direct assignment

// Future:
actorId: 'role:approver'; // anyone with "approver" role in tenant
actorId: 'group:finance-team'; // anyone in the "finance-team" group
```

This enables:

- Shared action queues (anyone in a role can see/claim)
- Load distribution across team members
- Coverage during absences (any team member can handle)

### Dependencies

- CSTAR integration for group membership resolution
- Claim/unclaim process for ownership control
- Actor type field (`actorType`) to distinguish individual vs role vs group

---

## 7. Summary & Priority

| Feature                    | Priority | Dependencies                    | Complexity |
| -------------------------- | -------- | ------------------------------- | ---------- |
| Workflow Triggers (Button) | High     | Trigger CRUD API, proxy pattern | Medium     |
| Workflow Triggers (Form)   | High     | Above + CHEFS integration reuse | Medium     |
| Claim/Unclaim              | High     | CSTAR, role-based actors        | High       |
| Auto-Expire Actions        | Medium   | Scheduler infrastructure        | Low        |
| Submission Updates         | Medium   | CHEFS capability confirmation   | Medium     |
| CSTAR Integration          | High     | External API availability       | Medium     |
| Role-Based Actor Matching  | High     | CSTAR, claim process            | High       |
