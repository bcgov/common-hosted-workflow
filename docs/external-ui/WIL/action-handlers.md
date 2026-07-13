# Action Handlers

This document covers the three action-type handlers in the WIL frontend — how they render, manage state, and communicate with the backend.

## Handler Dispatch

The `ActionDetailPane` component routes to the correct handler based on `actionType` and `status`:

```typescript
function ActionDetailPane({ action, tenantId, onInteractionSuccess }) {
  if (!action) return <Placeholder />;
  if (isTerminalStatus(action.status)) return <CompletedActionView action={action} />;

  switch (action.actionType) {
    case 'getapproval': return <GetApprovalHandler ... />;
    case 'showform':    return <ShowFormHandler ... />;
    case 'waitonevent': return <WaitOnEventHandler ... />;
    default:            return <UnsupportedAction ... />;
  }
}
```

Terminal statuses (`completed`, `cancelled`, `expired`, `deleted`) always render the `CompletedActionView` regardless of action type.

## Common Patterns

All handlers share these patterns:

1. **useMutation from @tanstack/react-query** — manages async callback submission state
2. **onInteractionSuccess callback** — triggers action list re-fetch after successful submission
3. **Ref-based callback storage** — prevents stale closures without triggering re-renders
4. **Shared error extraction** — `extractErrorMessage` from `action-handlers/shared/error-utils.ts` handles Axios errors, generic errors, and server error shapes

### Callback Body Structure

All handlers POST to the same endpoint:

```
POST /ui-api/wil/callback
Headers: Authorization, X-TENANT-ID
Body: { actionId: string, body: { ... handler-specific payload } }
```

## GetApproval Handler

**File:** `external-ui/src/components/action-handlers/get-approval-handler.tsx`

### What It Renders

- Sanitized HTML content from `payload.html` (rendered via `dangerouslySetInnerHTML`)
- A button for each entry in `payload.options`

### Payload Shape (from backend)

```typescript
{
  html?: string;       // HTML content (sanitized before rendering)
  options?: string[];  // Approval option labels (each becomes a button)
}
```

### HTML Sanitization

Uses DOMPurify with a strict allowlist:

- **Allowed tags:** Headings, paragraphs, lists, links, tables, code blocks, images, inline formatting
- **Allowed attributes:** `href`, `target`, `rel`, `alt`, `src`, `width`, `height`, `class`, `id`, `colspan`, `rowspan`
- **Blocked:** All script elements, event-handler attributes (`onclick`, `onerror`, etc.), data URIs, `ALLOW_DATA_ATTR: false`

### Interaction Flow

```
User clicks "Approve"
    │
    ├── setClickedOption("Approve")
    ├── approvalMutation.mutate("Approve")
    │       └── POST /callback { actionId, body: { option: "Approve" } }
    │
    ├── [Pending] All buttons disabled, spinner on clicked button
    │
    ├── [Success] "Your response has been submitted." + buttons hidden
    │       └── onInteractionSuccess() → re-fetch action list
    │
    └── [Error] Error message shown, buttons re-enabled, clickedOption cleared
```

### State Management

| State   | UI Effect                                       |
| ------- | ----------------------------------------------- |
| Idle    | Buttons enabled, no messages                    |
| Pending | All buttons disabled, spinner on clicked button |
| Success | Buttons hidden, green confirmation message      |
| Error   | Buttons re-enabled, red error message           |

### Graceful Degradation

- Missing `html` → no HTML section rendered (just buttons)
- Empty `options` → no buttons rendered (just HTML)
- Both missing → empty handler (no error)

## ShowForm Handler

**File:** `external-ui/src/components/action-handlers/show-form-handler.tsx`

### What It Renders

An embedded CHEFS form with full authentication context, prefill data, and submission callback.

### Payload Shape (from backend, after sensitive field stripping)

```typescript
{
  formId: string;                              // CHEFS form UUID
  formName?: string;                           // Display name
  formPreFillData?: Record<string, unknown>;   // Workflow-defined prefill values
  submissionId?: string;                       // Existing submission (if editing)
  // formApiKey is NEVER present — stripped server-side
}
```

### Initialization Flow

```
Action selected / tenantId changes
    │
    ├── initMutation.mutate({ tenantId, actionId, payload })
    │       │
    │       ├── Parallel fetch:
    │       │   ├── POST /ui-api/wil/chefs-token → { authToken, formId, baseUrl }
    │       │   └── GET /ui-api/whoami → { oidc: { claims: {...} } }
    │       │
    │       ├── Build token object (sub, roles, email, idp)
    │       ├── Build user object (name, firstName, lastName, email, username, idp)
    │       ├── Build prefill data (formPreFillData + userProfile)
    │       ├── Get app token for headers
    │       │
    │       └── Return InitData { authToken, formId, baseUrl, prefillData, token, user, headers }
    │
    ├── [Pending] "Loading form…" spinner
    ├── [Error] Error alert (form not rendered)
    └── [Success] Render <ChefsFormViewer ... />
```

### Submission Callback Flow

```
formio:submitDone event fires
    │
    ├── Extract submission_id from event detail
    │   (tries: submission.id, submission._id, detail.id, detail._id)
    │
    ├── callbackMutation.mutate({ tenantId, actionId, body: { formId, submission_id } })
    │       └── POST /ui-api/wil/callback
    │
    ├── [Pending] Overlay with "Submitting…" spinner, form blocked
    ├── [Success] "Form submitted successfully" + onInteractionSuccess()
    └── [Error] Error alert above form (form still visible for context)
```

### State Management

| State            | UI Effect                             |
| ---------------- | ------------------------------------- |
| Init pending     | "Loading form…" spinner (full pane)   |
| Init error       | Error alert, no form                  |
| Init success     | Form rendered                         |
| Callback pending | Semi-transparent overlay with spinner |
| Callback success | Success confirmation, form gone       |
| Callback error   | Error alert, form still visible       |

### Re-initialization on Action Change

When `action.id` or `tenantId` changes:

- `initMutation.mutate()` fires with new params
- `callbackMutation.reset()` clears previous callback state
- Effectively unmounts old form and starts fresh

## WaitOnEvent Handler

**File:** `external-ui/src/components/action-handlers/wait-on-event-handler.tsx`

### What It Renders

A single confirmation button and status messages.

### Interaction Flow

```
User clicks "Confirm Event"
    │
    ├── eventMutation.mutate()
    │       └── POST /callback { actionId, body: { eventName: "clicked" } }
    │
    ├── [Pending] Button disabled, spinner icon
    ├── [Success] Button disabled with checkmark, "Event acknowledged successfully"
    │       └── onInteractionSuccess() → re-fetch action list
    └── [Error] "An unexpected error occurred", button re-enabled
```

### Terminal Status Handling

If the action is already in a terminal status (`completed`, `cancelled`, `expired`, `deleted`):

- Button is rendered but permanently disabled
- A note "This action is no longer active." is displayed
- No callback is sent on click

### State Management

| State               | UI Effect                                      |
| ------------------- | ---------------------------------------------- |
| Idle (non-terminal) | Button enabled                                 |
| Idle (terminal)     | Button disabled + "no longer active" note      |
| Pending             | Button disabled, spinner icon                  |
| Success             | Button disabled, checkmark icon, green message |
| Error               | Button enabled, red error message              |

## Completed Action View

**File:** `external-ui/src/components/action-handlers/completed-action-view.tsx`

Shown for any action in a terminal status, regardless of type.

### What It Renders

- Status icon (color-coded by status)
- Status badge (Completed/Cancelled/Expired/Deleted)
- Formatted action type label
- Completion timestamp (`updatedAt` formatted as locale date/time)
- Payload summary (if available):
  - `showform` → `"Form: {FormName}"`
  - Other types → no summary

### No Interactive Elements

This view explicitly renders zero interactive elements — no buttons, no forms, no clickable options. It is a read-only confirmation that the action has reached its final state.

## Action List Refresh After Interaction

When any handler completes successfully, it calls `onInteractionSuccess()`. The parent page debounces this (1.5-second delay) and invalidates the `['wil-actions']` query key:

```typescript
const onInteractionSuccess = useCallback(() => {
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
  }, ACTION_LIST_REFRESH_DELAY_MS); // 1500ms
}, [queryClient]);
```

This delay gives the backend time to update the action status before the re-fetch. The success confirmation in the detail pane persists during and after the refresh — the user does not lose context.

## Error Message Extraction

All handlers use a shared utility at `components/action-handlers/shared/error-utils.ts` to extract user-friendly error messages:

```typescript
// action-handlers/shared/error-utils.ts
import axios from 'axios';

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    // Try server error shape: { error: { message: "..." } }
    // Then fallback shape: { message: "..." }
    const serverMessage = err.response?.data?.error?.message ?? err.response?.data?.message;
    return serverMessage ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
```

This ensures server-provided error context (e.g., "Upstream timeout", "Missing formApiKey") is shown to the user rather than generic "Network error" messages.
