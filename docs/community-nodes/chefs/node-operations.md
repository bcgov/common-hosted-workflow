# CHEFS node operations

## Operation and input matrix

Every operation requires the **CHEFS API** credential, **Form ID** (`formID`) and **Authorization Token** (`authorizationToken`). The token is checked locally; Form ID and the credential API key authenticate the upstream request.

| Resource                  | Operation               | Serialized operation                 | Submission ID      | HTTP method and path                     |
| ------------------------- | ----------------------- | ------------------------------------ | ------------------ | ---------------------------------------- |
| Submission (`submission`) | Get                     | `get`                                | Shown and required | `GET /submissions/{submissionID}`        |
| Status (`status`)         | Get Form Statuses       | `getFormStatuses`                    | Hidden and unused  | `GET /forms/{formID}/statusCodes`        |
| Status (`status`)         | Get Submission Statuses | `includeAuthorizationHeaderStatuses` | Shown and required | `GET /submissions/{submissionID}/status` |

The unusual serialized name `includeAuthorizationHeaderStatuses` is intentional for existing workflow compatibility. Use the UI label **Get Submission Statuses** when configuring the operation.

All paths are relative to `https://submit.digital.gov.bc.ca/app/api/v1`. Requests include `Accept: application/json`, `Content-Type: application/json`, and `authorization: Basic <base64 of formID:apiKey>`. The local authorization token is not included in the request.

## Input evaluation and validation

- **Resource** and **Operation** are fixed selections, with expressions disabled.
- **Form ID**, **Submission ID**, and the node **Authorization Token** support per-item expressions, such as `{{ $json.formId }}` and `{{ $json.submissionId }}`.
- The pre-send hook rejects missing, nonstring, empty and whitespace-only required identifiers and secrets. It validates Form ID for every operation, and Submission ID only for the two submission operations. Stored Submission ID values are unused when getting form statuses.
- Identifiers are checked for nonblank text, not UUID syntax or upstream existence. Their values and the existing route interpolation are preserved without trimming. Supply the identifiers issued by CHEFS.
- Tokens must match as exact UTF-8 bytes, including case and all whitespace. Whitespace-only tokens are invalid even if both values match. Nonblank API keys are used verbatim.
- Validation and token comparison complete before the hook creates or changes authorization headers. A rejected pre-send hook prevents that item's HTTP request. Unsupported resource/operation combinations also reject.

## Responses and errors

Submission retrieval returns the CHEFS submission response; form statuses returns the form's status-code response; submission statuses returns that submission's status response. n8n's declarative routing handles JSON responses and its normal error settings; this node adds no output unwrapping or custom error-item format.

Local errors name the invalid input or report **Authorization failed: Token mismatch**, without echoing supplied secret values. A mismatch is the local shared-secret check, before any upstream request. If that passes but CHEFS returns an authentication/authorization error, check the Form ID, its API key and the form's API access configuration. A missing submission or an identifier belonging to another form is an upstream concern.

See [credentials](./credentials.md) and [release notes](./release-notes.md).
