# Node Operations

This document describes every resource and operation available in the Workflow Interaction Layer node as seen in the n8n UI.

## Auto-Populated Fields

The node automatically injects two fields on every create operation; you do not need to set them:

| Field                | Source                  | Description                                 |
| -------------------- | ----------------------- | ------------------------------------------- |
| `workflowId`         | `this.getWorkflow().id` | The ID of the workflow containing this node |
| `workflowInstanceId` | `this.getExecutionId()` | The current execution ID                    |

## Resource: Message

### Create

| Parameter  | Type               | Required | Default | Description                                |
| ---------- | ------------------ | -------- | ------- | ------------------------------------------ |
| Actor ID   | string             | Yes      | -       | Target actor identifier                    |
| Actor Type | options            | Yes      | `user`  | `user`, `group`, `role`, `system`, `other` |
| Title      | string             | Yes      | -       | Message title                              |
| Body       | string (multiline) | Yes      | -       | Message body text                          |
| Metadata   | JSON               | No       | `{}`    | Arbitrary JSON metadata                    |

### Get Many / Get Messages by Actor ID

Both operations support actor, workflow instance, `since`, and `limit` filters as shown in the n8n UI.

## Resource: Action

### Create

Creates a new action in the WIL API layer.

| Parameter                                          | Type       | Required                           | Default       | Description                                                                                                       |
| -------------------------------------------------- | ---------- | ---------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Actor ID                                           | string     | Yes                                | -             | Target actor identifier                                                                                           |
| Actor Type                                         | options    | Yes                                | `user`        | `user`, `group`, `role`, `system`, `other`                                                                        |
| Action Type                                        | options    | Yes                                | `getapproval` | `getapproval`, `showform`, `waitonevent`                                                                          |
| Action Title                                       | string     | No                                 | -             | Optional title for the action                                                                                     |
| HTML                                               | string     | Yes, for `getapproval`             | -             | HTML content shown before approval options                                                                        |
| Options                                            | list       | Yes, for `getapproval`             | -             | Repeatable approval option labels. At least one option is required.                                               |
| CHEFS Form Authentication (credential)             | credential | Yes, for `showform`                | -             | Select a `chefsFormAuth` credential; supplies the CHEFS form ID and API key (see [Credentials](./credentials.md)) |
| CHEFS Form Submission ID                           | string     | No                                 | -             | Existing CHEFS form submission ID to prefill from prior data                                                      |
| Form Pre-Fill Data                                 | JSON       | No                                 | `{}`          | Object of CHEFS field API names and values                                                                        |
| Send Form Data to Callback (Skip CHEFS Submission) | boolean    | No                                 | `false`       | For `showform`. When on, the form data is sent to the callback URL instead of submitted to CHEFS                  |
| Callback Data                                      | options    | No                                 | `full`        | For `showform` + skip on. `Full Form Data` or `Selected Fields Only`                                              |
| Field Selection Mode                               | options    | No                                 | `keyValue`    | Shown for `Selected Fields Only`. `UI Field Pairs` or `JSON`                                                      |
| Fields to Send                                     | list       | Yes, for `Selected Fields Only`    | -             | Repeatable Output Key + Source Path (dot-notation) pairs                                                          |
| Fields to Send (JSON)                              | JSON       | Yes, for `Selected Fields Only`    | `{}`          | Object mapping output keys to dot-notation source paths                                                           |
| Missing Field Behavior                             | options    | No                                 | `returnNull`  | Shown for `Selected Fields Only`. `Return Null` or `Omit Field`                                                   |
| Payload                                            | JSON       | Yes, for `waitonevent`             | `{}`          | Free-form wait-on-event payload, for example `{ "eventName": "clicked" }`                                         |
| Callback Method                                    | options    | No                                 | `POST`        | `none`, `POST`, `PUT`, `PATCH`                                                                                    |
| Callback URL                                       | string     | Yes (when Callback Method != None) | -             | URL called when action completes                                                                                  |
| Callback Payload Spec                              | JSON       | No                                 | `{}`          | Template for expected callback body                                                                               |
| Due Date                                           | string     | No                                 | -             | RFC 3339 timestamp                                                                                                |
| Priority                                           | options    | No                                 | `normal`      | `normal` or `critical`                                                                                            |
| Check In                                           | string     | No                                 | -             | RFC 3339 reminder timestamp                                                                                       |
| Metadata                                           | JSON       | No                                 | `{}`          | Arbitrary JSON metadata                                                                                           |

`Action Title` is sent as top-level `actionTitle`; it is not nested inside `payload`.

#### Payload by Action Type

- `getapproval` builds payload `{ "html": "...", "options": ["Yes", "No"] }`.
- `showform` builds payload `{ "chefsCredentialId": "...", "submissionId": "...", "formPreFillData": {} }`. The `formId`, form name, and API key are **not** in the payload — they are resolved server-side from the selected `chefsFormAuth` credential (see [Credentials](./credentials.md)). When **Send Form Data to Callback** is enabled, `"skipChefsSubmission": true` is added. When **Callback Data** is `Selected Fields Only`, `"callbackFieldMappings": [...]` and `"callbackMissingPathBehavior": "returnNull" | "omit"` are also added.
- `waitonevent` uses the raw Payload JSON field, matching the previous behavior.

#### getapproval HTML Details

When `actionType` is `getapproval`, the node builds the payload from the **HTML** and **Options** fields:

```json
{
  "html": "<p>Do you approve this request?</p>",
  "options": ["Yes", "No"]
}
```

HTML and at least one approval option are required. The node rejects `getapproval` actions with missing HTML or an empty options list because the user would otherwise have no useful prompt or no way to respond.

The external UI sanitizes the HTML before rendering it. Inline scripts, event handlers, data attributes, and arbitrary inline CSS are not allowed. This keeps approval prompts safe while still allowing structured content.

Allowed tags include:

| Category | Tags                                                         |
| -------- | ------------------------------------------------------------ |
| Text     | `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `s`, `span`, `div` |
| Headings | `h1`, `h2`, `h3`, `h4`, `h5`, `h6`                           |
| Lists    | `ul`, `ol`, `li`                                             |
| Tables   | `table`, `thead`, `tbody`, `tr`, `th`, `td`                  |
| Other    | `a`, `img`, `hr`, `blockquote`, `code`, `pre`                |

Allowed attributes include:

| Attribute                       | Typical use                    |
| ------------------------------- | ------------------------------ |
| `href`, `target`, `rel`         | Links                          |
| `src`, `alt`, `width`, `height` | Images                         |
| `colspan`, `rowspan`            | Table cells                    |
| `class`, `id`                   | Non-sensitive identifiers only |

The renderer applies controlled styles for headings, paragraphs, lists, blockquotes, code, links, images, and tables. Do not rely on inline CSS such as `style="..."`, `border`, `cellpadding`, or `cellspacing`; those are stripped or ignored. Use normal semantic HTML and let the UI apply the approved styling.

##### Example: Simple Approval

HTML field:

```html
<h2>Approve Request</h2>
<p>Please confirm whether this request should proceed.</p>
```

Options:

```text
Approve
Reject
```

Generated payload:

```json
{
  "html": "<h2>Approve Request</h2><p>Please confirm whether this request should proceed.</p>",
  "options": ["Approve", "Reject"]
}
```

##### Example: Consent Prompt with Table

HTML field:

```html
<h2>Consent to Share Income Information</h2>

<p>
  By selecting <b>Yes</b>, you authorize us to collect and share your income information with authorized organizations
  to determine your eligibility and process your request.
</p>

<table>
  <tr>
    <th colspan="2">Consent Summary</th>
  </tr>
  <tr>
    <td><b>Purpose</b></td>
    <td>Determine eligibility and process your request.</td>
  </tr>
  <tr>
    <td><b>Information</b></td>
    <td>Income information provided by you or authorized sources.</td>
  </tr>
  <tr>
    <td><b>If you choose No</b></td>
    <td>We may not be able to complete your eligibility assessment.</td>
  </tr>
</table>

<blockquote>Your information will be used only for this purpose and handled securely.</blockquote>
```

Options:

```text
Yes
No
```

Generated payload:

```json
{
  "html": "<h2>Consent to Share Income Information</h2><p>By selecting <b>Yes</b>, you authorize us to collect and share your income information with authorized organizations to determine your eligibility and process your request.</p><table><tr><th colspan=\"2\">Consent Summary</th></tr><tr><td><b>Purpose</b></td><td>Determine eligibility and process your request.</td></tr><tr><td><b>Information</b></td><td>Income information provided by you or authorized sources.</td></tr><tr><td><b>If you choose No</b></td><td>We may not be able to complete your eligibility assessment.</td></tr></table><blockquote>Your information will be used only for this purpose and handled securely.</blockquote>",
  "options": ["Yes", "No"]
}
```

##### Example: Review Checklist

HTML field:

```html
<h3>Review Required</h3>
<p>Confirm that the following checks are complete before approving:</p>

<ul>
  <li>Applicant identity has been verified.</li>
  <li>Required documents have been reviewed.</li>
  <li>No duplicate request is active.</li>
</ul>

<hr />

<p><b>Decision:</b> choose one option below.</p>
```

Options:

```text
Approve
Needs Changes
Reject
```

Generated payload:

```json
{
  "html": "<h3>Review Required</h3><p>Confirm that the following checks are complete before approving:</p><ul><li>Applicant identity has been verified.</li><li>Required documents have been reviewed.</li><li>No duplicate request is active.</li></ul><hr><p><b>Decision:</b> choose one option below.</p>",
  "options": ["Approve", "Needs Changes", "Reject"]
}
```

#### showform Details

| Field                 | Type    | Required | Description                                                                                                                                                                   |
| --------------------- | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chefsCredentialId`   | string  | Yes      | ID of the selected `chefsFormAuth` credential. external-hooks resolves this server-side into the form ID and API key — the credential's own values are never in this payload. |
| `submissionId`        | string  | No       | Existing CHEFS form submission ID used to prefill the form from prior submission data                                                                                         |
| `formPreFillData`     | object  | No       | Key-value pairs matching CHEFS form field API names                                                                                                                           |
| `skipChefsSubmission` | boolean | No       | Set to `true` by the **Send Form Data to Callback** toggle. Only present in the payload when enabled.                                                                         |

If `submissionId` is provided, it takes full priority: the form loads the existing submission data and `formPreFillData` is ignored.

> **Migration note:** actions created before this change may still carry the legacy `formId`/`formName`/`formApiKey` fields instead of `chefsCredentialId`. external-hooks accepts both during the transition, but new actions should always use the credential-based flow — there is no `CHEFS Form Name`/`CHEFS Form ID`/`CHEFS Form API Key` parameter on the node anymore.

##### Send Form Data to Callback (Skip CHEFS Submission)

By default a `showform` action submits the completed form to CHEFS, which stores a submission record. The UI then sends the resulting **submission ID** to the callback URL, and the workflow typically fetches the submission data from CHEFS afterwards.

Enable **Send Form Data to Callback** when you want the workflow to receive the raw form data directly, without CHEFS storing a submission. The form is still rendered and validated by CHEFS — only the final storage step is skipped.

| Toggle        | CHEFS submission created? | Callback body sent to Callback URL                        |
| ------------- | ------------------------- | --------------------------------------------------------- |
| Off (default) | Yes                       | `{ "formId": "...", "submission_id": "..." }`             |
| On            | No                        | `{ "formId": "...", "formData": { ...all form fields } }` |

In both cases the user sees the same "Form submitted successfully" confirmation after completion.

**When the toggle is on, your callback/webhook node must read `formData` instead of `submission_id`.** Because no submission is stored in CHEFS, the `formData` object is the only record of the response — persist it in the workflow if you need it later.

**Example payload (toggle on):**

```json
{
  "chefsCredentialId": "cred-abc123",
  "skipChefsSubmission": true
}
```

**Example callback body received by the workflow (toggle on):**

```json
{
  "formId": "11111111-1111-1111-1111-111111111111",
  "formData": {
    "firstName": "Nicholas",
    "lastName": "Cognito",
    "annualIncome": 52000
  }
}
```

##### Callback Data: Full Form Data vs Selected Fields Only

When **Send Form Data to Callback** is on, a **Callback Data** option appears:

- **Full Form Data** (default) — the entire form response is sent as `formData`, exactly as shown above.
- **Selected Fields Only** — you define which fields to send. Only those fields ever leave the user's browser, and the workflow receives a smaller, predictable payload. This uses the same dot-notation mapping style as the **CHEFS Submission Extractor** node, but applied in the browser before the callback fires.

With **Selected Fields Only** you provide a set of mappings, each with:

| Field        | Description                                                                        |
| ------------ | ---------------------------------------------------------------------------------- |
| `outputKey`  | The key name the workflow receives in `formData`                                   |
| `sourcePath` | Dot-notation path into the submitted form data, e.g. `firstName` or `address.city` |

Mappings can be entered as **UI Field Pairs** or as a **JSON** object (`{ "city": "address.city" }`). At least one field is required — the node rejects the action at configuration time if none are provided.

**Missing Field Behavior** controls what happens when a `sourcePath` is not present in the submitted data:

- **Return Null** (default) — the `outputKey` is included with a `null` value.
- **Omit Field** — the `outputKey` is left out of `formData` entirely.

**Example payload (Selected Fields Only):**

```json
{
  "chefsCredentialId": "cred-abc123",
  "skipChefsSubmission": true,
  "callbackFieldMappings": [
    { "outputKey": "firstName", "sourcePath": "firstName" },
    { "outputKey": "city", "sourcePath": "address.city" }
  ],
  "callbackMissingPathBehavior": "returnNull"
}
```

**Example callback body received by the workflow (Selected Fields Only):**

```json
{
  "formId": "11111111-1111-1111-1111-111111111111",
  "formData": {
    "firstName": "Nicholas",
    "city": "Victoria"
  }
}
```

The user still sees the same "Form submitted successfully" confirmation. Field selection happens entirely in the browser, so fields you do not map are never transmitted to the callback.

### Create, Wait and Get Data

Creates an action exactly like **Create** (same Action Type, Actor, form/approval/wait-on-event fields, Due Date, Priority, Check In, Metadata), then pauses the workflow execution until the actor completes it, and outputs the data WIL sends back on completion.

| Parameter                                                                                  | Type     | Required                                    | Default             | Description                                                                               |
| ------------------------------------------------------------------------------------------ | -------- | ------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| _(all Create fields above, except Callback Method / Callback URL / Callback Payload Spec)_ |          |                                             |                     |                                                                                           |
| Limit Wait Time                                                                            | boolean  | No                                          | `false`             | Whether to resume automatically after a limit if the actor never responds                 |
| Limit Type                                                                                 | options  | No                                          | `afterTimeInterval` | Shown when Limit Wait Time is on. `After Time Interval` or `At Specified Time`.           |
| Amount                                                                                     | number   | No                                          | `1`                 | Shown when Limit Type is `After Time Interval`. The amount of time to wait.               |
| Unit                                                                                       | options  | No                                          | `hours`             | Shown when Limit Type is `After Time Interval`. `seconds`, `minutes`, `hours`, or `days`. |
| Max Date and Time                                                                          | dateTime | Yes, when Limit Type is `At Specified Time` | -                   | Shown when Limit Type is `At Specified Time`. The exact date/time to resume at.           |

**Callback URL and Callback Method are not configurable for this operation.** They are set automatically to `POST` against this execution's resume URL (`$execution.resumeUrl`), so the WIL backend calls back into this node when the actor completes the action.

For `showform`, the same **Send Form Data to Callback (Skip CHEFS Submission)** and **Callback Data** (`Full Form Data` / `Selected Fields Only`) options from Create are available, with identical behavior:

- Skip off (default): the actor's response arrives as `{ "formId": "...", "submission_id": "..." }`. The workflow is responsible for fetching the full submission from CHEFS afterward if needed (for example with the CHEFS Submission Extractor node).
- Skip on: the actor's response arrives as `{ "formId": "...", "formData": { ... } }` (or a subset of fields, if Callback Data is set to Selected Fields Only) — no separate CHEFS submission is created.

#### Detecting a timeout — use `$execution.customData`, not this node's output

**On a real timeout, this node's output cannot be used to detect that a timeout happened.** n8n does not re-run node code when a local wait time limit elapses — it simply resumes downstream nodes using this node's _input_ data (the same items that fed into it), not any value the node's own code returned before pausing. This matches n8n's native Wait node's own behavior for time-based resumes. Concretely: on a real actor completion, `$json` contains the actor's response (see above); on a timeout, `$json` contains whatever this node's _input_ was — not a status field, not the action ID.

To reliably detect a timeout and get the action ID afterward, this operation stashes both in execution-scoped `customData` instead, which survives regardless of how the execution resumes:

| Key               | Set to                  | When                                                                |
| ----------------- | ----------------------- | ------------------------------------------------------------------- |
| `wilActionId`     | the created action's ID | Always, right after the action is created (before the wait starts)  |
| `wilActionStatus` | `waiting`               | Right after the action is created (before the wait starts)          |
| `wilActionStatus` | `completed`             | When the actor actually completes the action (the callback arrives) |

There is no `expired` value written by this node — n8n has no hook that runs at the exact moment a wait time limit elapses, so nothing can flip the status then. If `wilActionStatus` is still `waiting` after this node resumes, that **is** the timeout signal.

**Read `customData` from a Code node, not a plain expression field.** `$execution.customData.get(...)` has been confirmed to resolve reliably inside a Code node's JS, but not consistently inside a plain `={{ ... }}` expression on an arbitrary downstream node's parameter (an n8n-platform quirk, not something this node controls). Bridge the values into regular `$json` fields first:

```
Create, Wait and Get Data
  → Code node:
      for (const item of $input.all()) {
        item.json.actionId = $execution.customData.get("wilActionId");
        item.json.actionStatus = $execution.customData.get("wilActionStatus");
      }
      return $input.all();
  → IF {{ $json.actionStatus }} != "completed"
      → Action: Update (Action ID = {{ $json.actionId }}, Status = Expired)
```

**Note:** this operation pauses the entire n8n execution (not just this node) until resumed, so it only supports a single item at a time — if multiple items reach this node, only the first is processed.

### Other Action Operations

- `Get` retrieves a single action by ID.
- `Get Many` lists actions with optional actor, workflow instance, `since`, and `limit` filters.
- `Update` updates action status. To delete an action, update status to `deleted`.
