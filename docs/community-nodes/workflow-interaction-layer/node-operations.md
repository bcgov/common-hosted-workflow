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

| Parameter                | Type    | Required                           | Default       | Description                                                               |
| ------------------------ | ------- | ---------------------------------- | ------------- | ------------------------------------------------------------------------- |
| Actor ID                 | string  | Yes                                | -             | Target actor identifier                                                   |
| Actor Type               | options | Yes                                | `user`        | `user`, `group`, `role`, `system`, `other`                                |
| Action Type              | options | Yes                                | `getapproval` | `getapproval`, `showform`, `waitonevent`                                  |
| Action Title             | string  | No                                 | -             | Optional title for the action                                             |
| HTML                     | string  | Yes, for `getapproval`             | -             | HTML content shown before approval options                                |
| Options                  | list    | Yes, for `getapproval`             | -             | Repeatable approval option labels. At least one option is required.       |
| CHEFS Form Name          | string  | Yes, for `showform`                | -             | CHEFS form name shown for the form action                                 |
| CHEFS Form ID            | string  | Yes, for `showform`                | -             | CHEFS form ID to render                                                   |
| CHEFS Form API Key       | string  | Yes, for `showform`                | -             | CHEFS form API key used server-side                                       |
| CHEFS Form Submission ID | string  | No                                 | -             | Existing CHEFS form submission ID to prefill from prior data              |
| Form Pre-Fill Data       | JSON    | No                                 | `{}`          | Object of CHEFS field API names and values                                |
| Payload                  | JSON    | Yes, for `waitonevent`             | `{}`          | Free-form wait-on-event payload, for example `{ "eventName": "clicked" }` |
| Callback Method          | options | No                                 | `POST`        | `none`, `POST`, `PUT`, `PATCH`                                            |
| Callback URL             | string  | Yes (when Callback Method != None) | -             | URL called when action completes                                          |
| Callback Payload Spec    | JSON    | No                                 | `{}`          | Template for expected callback body                                       |
| Due Date                 | string  | No                                 | -             | RFC 3339 timestamp                                                        |
| Priority                 | options | No                                 | `normal`      | `normal` or `critical`                                                    |
| Check In                 | string  | No                                 | -             | RFC 3339 reminder timestamp                                               |
| Metadata                 | JSON    | No                                 | `{}`          | Arbitrary JSON metadata                                                   |

`Action Title` is sent as top-level `actionTitle`; it is not nested inside `payload`.

#### Payload by Action Type

- `getapproval` builds payload `{ "html": "...", "options": ["Yes", "No"] }`.
- `showform` builds payload `{ "formName": "...", "formId": "...", "formApiKey": "...", "submissionId": "...", "formPreFillData": {} }`.
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

| Field             | Type   | Required | Description                                                                                    |
| ----------------- | ------ | -------- | ---------------------------------------------------------------------------------------------- |
| `formName`        | string | Yes      | CHEFS form name shown for the form action                                                      |
| `formId`          | string | Yes      | CHEFS form ID to render                                                                        |
| `formApiKey`      | string | Yes      | CHEFS form API key used server-side. The backend strips it before returning actions to the UI. |
| `submissionId`    | string | No       | Existing CHEFS form submission ID used to prefill the form from prior submission data          |
| `formPreFillData` | object | No       | Key-value pairs matching CHEFS form field API names                                            |

If `submissionId` is provided, it takes full priority: the form loads the existing submission data and `formPreFillData` is ignored.

### Other Action Operations

- `Get` retrieves a single action by ID.
- `Get Many` lists actions with optional actor, workflow instance, `since`, and `limit` filters.
- `Update` updates action status. To delete an action, update status to `deleted`.
