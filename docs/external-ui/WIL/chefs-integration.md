# CHEFS Integration

This document covers how the external-ui embeds and interacts with CHEFS (Common Hosted Enterprise Forms Service) forms via the `<chefs-form-viewer>` web component.

## Overview

CHEFS forms are rendered using a web component (`<chefs-form-viewer>`) distributed as a script from the CHEFS application. The external-ui wraps this web component in a React component (`ChefsFormViewer`) that handles script loading, attribute binding, event listening, and lifecycle cleanup.

## Component Architecture

```
ShowFormHandler (action-handlers/show-form-handler.tsx)
│
│  1. Fetch CHEFS token + OIDC claims (parallel)
│  2. Build token/user/prefill objects
│  3. Render:
│
└── ChefsFormViewer (components/chefs/chefs-form-viewer.tsx)
    │
    │  1. Load script via useChefsScript hook
    │  2. Inject <chefs-form-viewer> element into DOM
    │  3. Set attributes (form-id, auth-token, token, user, headers, etc.)
    │  4. Listen for formio events
    │  5. Apply prefill data on formio:ready
    │
    └── <chefs-form-viewer> (web component from CHEFS)
        │
        └── Formio.js form instance (renders the form)
```

## File Locations

| File                                                               | Purpose                                                           |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `external-ui/src/components/chefs/chefs-form-viewer.tsx`           | React wrapper component                                           |
| `external-ui/src/components/chefs/use-chefs-script.hook.ts`        | Dynamic script loader hook                                        |
| `external-ui/src/components/chefs/types.ts`                        | Shared types (`ChefsFormViewerProps`, `ScriptStatus`)             |
| `external-ui/src/components/action-handlers/show-form-handler.tsx` | WIL ShowForm handler that orchestrates the CHEFS flow             |
| `external-ui/src/components/wil/actions-tab.tsx`                   | Actions list (renders action items that can lead to form display) |

## Dynamic Script Loading

The `useChefsScript` hook manages loading the CHEFS web component script as a singleton — it prevents duplicate `<script>` tags regardless of how many times `ChefsFormViewer` mounts/unmounts.

### How It Works

```typescript
const SCRIPT_PATH = import.meta.env.VITE_CHEFS_SCRIPT_PATH || '/embed/chefs-form-viewer.min.js';

// Full URL: e.g., "https://submit.digital.gov.bc.ca/app/embed/chefs-form-viewer.min.js"
const scriptUrl = `${baseUrl}${SCRIPT_PATH}`;
```

1. On first mount, check if a `<script src="...">` already exists in the DOM.
2. If not, create one, set `async = true`, append to `<head>`.
3. Track status via `dataset.status` on the script element: `loading` → `ready` or `error`.
4. Subsequent mounts reuse the existing script element (singleton).

### Version Pinning

To pin a specific CHEFS version (useful for stability in production), set:

```env
VITE_CHEFS_SCRIPT_PATH=/embed/chefs-form-viewer.2.4.0.min.js
```

Default loads the latest: `/embed/chefs-form-viewer.min.js`.

## ChefsFormViewer Props

```typescript
interface ChefsFormViewerProps {
  formId: string; // CHEFS form UUID
  authToken?: string; // Short-lived JWT from token exchange
  baseUrl?: string; // CHEFS app URL (default: https://submit.digital.gov.bc.ca/app)
  submissionId?: string; // Existing submission to load (view/edit mode)
  prefillData?: Record<string, unknown>; // Data to inject into form fields
  token?: Record<string, unknown>; // Auth context for form logic (sub, roles, email, idp)
  user?: Record<string, unknown>; // User display info (name, email, username, idp)
  headers?: Record<string, string>; // Custom headers (e.g., Authorization: Bearer <appToken>)
  readOnly?: boolean; // Render form in read-only mode
  language?: string; // Form language (default: 'en')
  onFormReady?: (detail: { formio: unknown }) => void;
  onSubmissionComplete?: (detail: unknown) => void;
  onSubmissionError?: (detail: unknown) => void;
}
```

## Web Component Attributes

The React component injects `<chefs-form-viewer>` with these HTML attributes:

| Attribute        | Source               | Format                  |
| ---------------- | -------------------- | ----------------------- |
| `form-id`        | `props.formId`       | Plain string            |
| `base-url`       | `props.baseUrl`      | URL string              |
| `auth-token`     | `props.authToken`    | JWT string              |
| `submission-id`  | `props.submissionId` | UUID string (optional)  |
| `token`          | `props.token`        | JSON.stringify'd object |
| `user`           | `props.user`         | JSON.stringify'd object |
| `headers`        | `props.headers`      | JSON.stringify'd object |
| `read-only`      | `props.readOnly`     | `"true"` if set         |
| `language`       | `props.language`     | `"en"`, `"fr"`, etc.    |
| `isolate-styles` | Always set           | Attribute presence flag |

Note: `token`, `user`, and `headers` use single-quote wrapping (`'...'`) in the HTML because they contain JSON with double quotes.

## Event Handling

The component listens for three custom events dispatched by the web component:

### `formio:ready`

Fired when the form has finished loading and is ready for interaction.

**What happens:**

1. Spinner is hidden (`setIsFormMounted(true)`)
2. Prefill data is applied (if provided and no `submissionId`)
3. `onFormReady` callback is invoked with the formio instance

### `formio:submitDone`

Fired when a form submission completes successfully.

**What happens:**

1. `onSubmissionComplete` callback is invoked with the submission detail
2. In WIL context: triggers the callback proxy POST with `{ formId, submission_id }`

### `formio:submitError`

Fired when a form submission fails.

**What happens:**

1. `onSubmissionError` callback is invoked with the error detail

## Prefill Data Injection

Prefill data is applied **only** for new forms (no `submissionId`). It is applied on `formio:ready` through two strategies:

```typescript
// Strategy 1: Use the web component's setSubmission method
const viewer = formViewer as { setSubmission?: (data: Record<string, unknown>) => void };
if (typeof viewer.setSubmission === 'function') {
  viewer.setSubmission(prefillData);
}
// Strategy 2: Fallback — set submission directly on the formio instance
else if (formioInstance && 'submission' in formioInstance) {
  formioInstance.submission = { data: { ...prefillData } };
}
```

### Prefill Data Composition

In the WIL ShowForm handler, prefill data is assembled from two sources:

```typescript
const prefillData = {
  ...formPreFillData, // Action payload field — workflow-designer defined values
  ...userProfile, // OIDC claims mapped to CHEFS-expected field names
};
```

**User profile fields** (from OIDC claims):

| Prefill Key | OIDC Claim Source   |
| ----------- | ------------------- |
| `idpUserId` | `idir_user_guid`    |
| `username`  | `idir_username`     |
| `firstName` | `given_name`        |
| `lastName`  | `family_name`       |
| `fullName`  | `display_name`      |
| `email`     | `email`             |
| `idp`       | `identity_provider` |

User profile values override `formPreFillData` if there are key collisions (spread order).

## Submission Handling

### Current Behavior: Always New Submission

Currently, every form interaction in WIL creates a **new submission**. Even if `submissionId` is provided in the action payload, the form is rendered in submission mode (not edit mode) unless explicitly configured otherwise.

After `formio:submitDone`:

1. Extract `submission_id` from the event detail:

   ```typescript
   const submissionId = submission?.id ?? submission?._id ?? detail?.id ?? detail?._id ?? '';
   ```

2. POST to callback proxy:

   ```typescript
   postWilCallback({
     tenantId,
     actionId: action.id,
     body: { formId, submission_id: submissionId },
   });
   ```

3. The upstream n8n webhook receives the form ID and submission ID, which it can use to fetch the full submission data from CHEFS if needed.

### Submit Modes: CHEFS Submission vs Host-Controlled

`ChefsFormViewer` accepts a `submitMode` prop that maps to the web component's `submit-mode` attribute. The WIL ShowForm handler selects the mode based on `skipChefsSubmission` from the `/chefs-token` response (which mirrors the `showform` action payload set by the WIL node).

| `submitMode`        | Attribute rendered   | Event fired         | Callback body               | CHEFS submission stored? |
| ------------------- | -------------------- | ------------------- | --------------------------- | ------------------------ |
| `'chefs'` (default) | none (default)       | `formio:submitDone` | `{ formId, submission_id }` | Yes                      |
| `'none'`            | `submit-mode="none"` | `formio:hostSubmit` | `{ formId, formData }`      | No                       |

When `skipChefsSubmission === true`, the handler passes `submitMode="none"` and an `onHostSubmit` callback. CHEFS still renders and validates the form, but does not persist a submission; the full validated form data arrives in `detail.data` on the `formio:hostSubmit` event and is forwarded to the callback URL. Draft saves (`detail.isDraft === true`) are ignored. The user sees the same "Form submitted successfully" confirmation in both modes.

`submit-mode="none"` is only emitted when the mode is not the default `'chefs'`, so the default flow is byte-for-byte unchanged.

### Limitation: No Submission Updates (Yet)

The current implementation does not support editing existing submissions. The `submissionId` prop on `ChefsFormViewer` is wired but the WIL flow always treats interactions as new form fills. See [Future Work](./future-work.md) for planned submission update support.

## Lifecycle and Cleanup

The component performs thorough cleanup on unmount:

1. **Remove event listeners** — prevents memory leaks from orphaned handlers
2. **Destroy web component** — calls `viewer.destroy()` if available, which clears internal timers (e.g., CHEFS auth token refresh intervals)
3. **Reset state** — `setIsFormMounted(false)` ensures spinner shows on next mount

```typescript
return () => {
  formViewer.removeEventListener('formio:ready', handleFormReady);
  formViewer.removeEventListener('formio:submitDone', handleSubmit);
  formViewer.removeEventListener('formio:submitError', handleSubmitError);

  const viewerInstance = formViewer as HTMLElement & { destroy?: () => void };
  if (typeof viewerInstance.destroy === 'function') {
    viewerInstance.destroy();
  }

  setIsFormMounted(false);
};
```

## Stability Considerations

### Re-render Prevention

The component uses several techniques to avoid unnecessary re-renders that would destroy and recreate the form:

- **Memoized JSON serialization** — `token`, `user`, `headers` are stringified via `useMemo` and only trigger re-renders when their content actually changes.
- **Ref-based callbacks** — `onFormReady`, `onSubmissionComplete`, `onSubmissionError`, `onBeforeSubmit`, `onHostSubmit` are stored in refs so the main effect's dependency array stays stable.
- **Ref-based prefillData** — stored in a ref and read at event time, not in the effect deps.

### Effect Dependencies

The main effect re-runs (destroys and recreates the form) only when these change:

```typescript
[
  scriptStatus,
  formId,
  authToken,
  submissionId,
  baseUrl,
  tokenJson,
  userJson,
  headersJson,
  readOnly,
  language,
  submitMode,
];
```

This means changing the action (different `formId` or `authToken`) correctly re-renders a fresh form.

## Error States

| Condition                   | Behavior                                                     |
| --------------------------- | ------------------------------------------------------------ |
| Script fails to load        | Shows "Failed to load form. Please try refreshing the page." |
| Script loading              | Shows spinner with "Loading form…"                           |
| Form loading (after script) | Shows spinner until `formio:ready` fires                     |
| Form submission error       | `onSubmissionError` callback invoked — handler shows alert   |
| Token fetch failure         | ShowFormHandler shows error, form never renders              |
