# CHEFS Submission Extractor

A custom n8n community node that fetches a [CHEFS](https://submit.digital.gov.bc.ca) (Common Hosted Form Service) form submission by Submission ID and extracts user-specified fields from the response using dot-notation path mappings.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Node Parameters](#node-parameters)
- [Field Mapping](#field-mapping)
  - [UI Field Pairs Mode](#ui-field-pairs-mode)
  - [JSON Mode](#json-mode)
- [Dot-Notation Path Resolution](#dot-notation-path-resolution)
- [Missing Path Behavior](#missing-path-behavior)
- [Submission Metadata](#submission-metadata)
- [Error Handling](#error-handling)
- [Examples](#examples)
- [Credential Setup](#credential-setup)
- [API Reference](#api-reference)

## Overview

The CHEFS Submission Extractor node connects to the BC Government's Common Hosted Form Service API, retrieves a full submission payload, and produces a filtered output containing only the fields you specify. This is useful when CHEFS submissions contain large, deeply nested form data and your workflow only needs a handful of values.

Key capabilities:

- Fetch any CHEFS form submission by its Submission ID
- Extract specific fields using dot-notation paths (e.g. `company.address.city`)
- Two field mapping modes: interactive UI pairs or a JSON object
- Configurable behavior for missing paths (return `null` or throw an error)
- Optional inclusion of submission metadata (created/updated timestamps and authors)
- Compatible with n8n's AI agent tool integration (`usableAsTool: true`)
- Full support for n8n's `continueOnFail` error handling

## Authentication

This node uses the **CHEFS Form Authentication** credential (`chefsFormAuth`). Authentication is performed via HTTP Basic Auth where:

- **Username** = Form ID
- **Password** = API Key

The node constructs a `Basic` authorization header from these values for every API request. See [Credential Setup](#credential-setup) for configuration details.

## Node Parameters

| Parameter                   | Type              | Required    | Default          | Description                                                                 |
| --------------------------- | ----------------- | ----------- | ---------------- | --------------------------------------------------------------------------- |
| Submission ID               | `string`          | Yes         | —                | The ID of the CHEFS submission to retrieve                                  |
| Field Mapping Mode          | `options`         | No          | `UI Field Pairs` | Choose between interactive key-value pairs or a JSON object                 |
| Missing Path Behavior       | `options`         | No          | `Return Null`    | What to do when a source path does not exist in the submission              |
| Include Submission Metadata | `boolean`         | No          | `false`          | Append `_createdBy`, `_createdAt`, `_updatedBy`, `_updatedAt` to the output |
| Field Mappings              | `fixedCollection` | Conditional | —                | UI key-value pairs (shown when mode is `UI Field Pairs`)                    |
| Field Mapping JSON          | `json`            | Conditional | `{}`             | JSON object mapping output keys to source paths (shown when mode is `JSON`) |

## Field Mapping

Field mappings define which values to extract from the submission data and what to name them in the output. Each mapping is a pair of:

- **Output Key**: The property name in the node's output object
- **Source Path**: A dot-notation path into the submission data

### UI Field Pairs Mode

Add rows interactively in the n8n editor. Each row has an Output Key and a Source Path field.

| Output Key      | Source Path                                      |
| --------------- | ------------------------------------------------ |
| `city`          | `company.headquarters.address.city`              |
| `applicantName` | `applicant.name`                                 |
| `sfAccountId`   | `company.meta.integrations.salesforce.accountId` |

### JSON Mode

Provide a single JSON object where keys are output names and values are dot-notation source paths:

```json
{
  "city": "company.headquarters.address.city",
  "applicantName": "applicant.name",
  "sfAccountId": "company.meta.integrations.salesforce.accountId"
}
```

Both modes produce identical results for equivalent configurations. At least one field mapping is required.

## Dot-Notation Path Resolution

Source paths use dot-separated segments to traverse nested objects and arrays in the submission data. Numeric segments are treated as array indices when the current value is an array.

For example, given this submission data:

```json
{
  "company": {
    "headquarters": {
      "address": {
        "city": "Victoria",
        "province": "BC"
      }
    }
  },
  "applicant": {
    "name": "Jane Doe",
    "phone": null
  },
  "items": [
    { "name": "Widget", "quantity": 5 },
    { "name": "Gadget", "quantity": 3 }
  ]
}
```

- `company.headquarters.address.city` resolves to `"Victoria"`
- `applicant.name` resolves to `"Jane Doe"`
- `applicant.phone` resolves to `null` (the path exists; the value is null)
- `items.0.name` resolves to `"Widget"` (numeric segment indexes into the array)
- `items.1.quantity` resolves to `3`
- `applicant.fax` does not resolve (the path does not exist)
- `items.5.name` does not resolve (index out of bounds)

Important: the resolver distinguishes between a path that **exists with an empty value** (`null`, `""`, `0`, `false`) and a path that **does not exist**. Empty values at valid paths are always returned as-is.

## Missing Path Behavior

Controls what happens when one or more source paths do not exist in the submission data.

### Return Null (default)

Unresolved paths produce `null` in the output. No error is thrown. The output always contains exactly one key per mapping.

```
Mapping:  { "city": "company.address.city", "foo": "nonexistent.path" }
Output:   { "city": "Victoria", "foo": null }
```

### Throw Error

A single `NodeOperationError` is raised listing all missing paths. No partial output is produced. The error is catchable via n8n's Error Workflow.

```
Error: The following fields do not exist on the submission: "foo" (path: nonexistent.path)
```

## Submission Metadata

When **Include Submission Metadata** is enabled, four fields from the top-level API response are appended to the output:

| Output Key   | Source                           |
| ------------ | -------------------------------- |
| `_createdBy` | Who created the submission       |
| `_createdAt` | Creation timestamp (ISO 8601)    |
| `_updatedBy` | Who last updated the submission  |
| `_updatedAt` | Last update timestamp (ISO 8601) |

These keys are prefixed with `_` to avoid collisions with user-defined output keys. This toggle operates independently of field mappings and missing path behavior.

## Error Handling

The node handles errors at multiple levels:

| Scenario                               | Behavior                                                        |
| -------------------------------------- | --------------------------------------------------------------- |
| CHEFS API returns 401/403              | `NodeApiError` wrapping the HTTP error                          |
| CHEFS API returns 404                  | `NodeApiError` wrapping the HTTP response                       |
| API response missing `submission.data` | `NodeOperationError`: "Unexpected CHEFS API response structure" |
| Invalid JSON in field mapping          | `NodeOperationError`: "Invalid field mapping JSON: ..."         |
| No field mappings provided             | `NodeOperationError`: "At least one field mapping is required"  |
| Missing paths with Throw Error mode    | `NodeOperationError` listing all missing paths                  |

When **continueOnFail** is enabled on the node, errors produce `{ "error": "<message>" }` in the output for the failed item, and processing continues with remaining items. Each output item is linked to its source input item via `pairedItem` metadata.

## Examples

### Basic field extraction

Extract a city name and email from a submission:

**Configuration:**

- Submission ID: `b7ef4797-...`
- Field Mapping Mode: UI Field Pairs
- Mappings:
  - `city` ← `company.headquarters.address.city`
  - `email` ← `applicant.email`

**Output:**

```json
{
  "city": "Victoria",
  "email": "jane@example.com"
}
```

### JSON mode with metadata

**Configuration:**

- Submission ID: `b7ef4797-...`
- Field Mapping Mode: JSON
- Field Mapping JSON: `{ "city": "company.headquarters.address.city" }`
- Include Submission Metadata: `true`

**Output:**

```json
{
  "city": "Victoria",
  "_createdBy": "gateway-user",
  "_createdAt": "2026-04-16T21:57:00.610Z",
  "_updatedBy": null,
  "_updatedAt": "2026-04-16T21:57:00.610Z"
}
```

### Graceful handling of missing fields

**Configuration:**

- Mappings: `{ "foo": "nonexistent.path", "city": "company.headquarters.address.city" }`
- Missing Path Behavior: Return Null

**Output:**

```json
{
  "foo": null,
  "city": "Victoria"
}
```

## Credential Setup

The node uses the **CHEFS Form Authentication** credential type (`chefsFormAuth`), defined in `credentials/ChefsFormAuth.credentials.ts`.

### Credential Fields

| Field     | Type                | Default                                       | Description                                                        |
| --------- | ------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| Form Name | `string`            | —                                             | A friendly label to identify this credential (not sent to the API) |
| Base URL  | `string`            | `https://submit.digital.gov.bc.ca/app/api/v1` | Base URL of the CHEFS API                                          |
| Form ID   | `string`            | —                                             | The CHEFS Form ID, used as the Basic Auth username                 |
| API Key   | `string` (password) | —                                             | The CHEFS API Key for the form, used as the Basic Auth password    |

### How to obtain credentials

1. Log in to the [CHEFS application](https://submit.digital.gov.bc.ca)
2. Navigate to your form's settings
3. Under the API access section, locate or generate your **Form ID** and **API Key**
4. In n8n, create a new **CHEFS Form Authentication** credential and enter these values
5. The **Base URL** field defaults to the production CHEFS API. Change it only if you are targeting a different environment (e.g. a development or test instance)

For more information, see the [CHEFS Wiki](https://github.com/bcgov/common-hosted-form-service/wiki).

## API Reference

This node calls the CHEFS REST API:

- **Endpoint**: `GET {baseUrl}/submissions/{submissionId}`
- **Auth**: Basic Auth (`base64(formId:apiKey)`)
- **Response structure**: The API wraps the submission inside a top-level `submission` key. Form data is located at `response.submission.submission.data`. Metadata fields (`createdBy`, `createdAt`, `updatedBy`, `updatedAt`) are at `response.submission`.

Full API documentation: [https://submit.digital.gov.bc.ca/app/api/v1/docs](https://submit.digital.gov.bc.ca/app/api/v1/docs)

## Project Structure

```
nodes/CHEFSSubmissionExtractor/
├── CHEFSSubmissionExtractor.node.ts      # Main node class and execute() logic
├── CHEFSSubmissionExtractor.node.json    # n8n codex metadata
├── shared/
│   ├── chefsApiRequest.ts                # Authenticated HTTP request helper
│   ├── fieldExtractor.ts                 # Dot-path resolution and field extraction
│   └── types.ts                          # TypeScript interfaces
└── README.md                             # This file

credentials/
└── ChefsFormAuth.credentials.ts          # n8n credential type definition
```
