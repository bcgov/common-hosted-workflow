# Node Operations

This document describes every resource, operation, and parameter available in the BC Gov SharePoint node.

## Common Parameters

These parameters are always visible regardless of the selected resource or operation:

| Parameter              | Type             | Required | Default                   | Description                                                               |
| ---------------------- | ---------------- | -------- | ------------------------- | ------------------------------------------------------------------------- |
| Resource               | select           | Yes      | `Item`                    | The SharePoint resource to operate on (Item, File, List, User)            |
| Site                   | resource locator | No       | Credential's Default Site | The target SharePoint site (by URL, Host & Path, or ID)                   |
| Refresh Metadata Cache | boolean          | No       | `false`                   | Bypass and repopulate cached site/list/column metadata for this execution |

### Site Parameter Modes

| Mode           | Input format             | Example                                           |
| -------------- | ------------------------ | ------------------------------------------------- |
| By URL         | Full SharePoint site URL | `https://bcgov.sharepoint.com/sites/ENV-STB-TEST` |
| By Host & Path | `hostname/path`          | `bcgov.sharepoint.com/sites/ENV-STB-TEST`         |
| By ID          | Graph composite site ID  | `bcgov.sharepoint.com,collection-guid,web-guid`   |

If the Site field is left blank, the credential's **Default Site URL** is used.

---

## Item Resource

Operate on SharePoint list items. Requires a **List** selection (from dropdown, by name, or by ID).

### Item: Create

Create a new list item with field values mapped by display name or internal name.

| Parameter        | Type             | Required | Default  | Description                                                   |
| ---------------- | ---------------- | -------- | -------- | ------------------------------------------------------------- |
| List             | resource locator | Yes      | —        | Target list (From List dropdown, By Name, or By ID)           |
| Field Input Mode | select           | Yes      | `fields` | How to provide field values: Pick Fields or Use JSON          |
| Fields           | fixed collection | Yes\*    | —        | Column/value pairs (Pick Fields mode)                         |
| Fields (JSON)    | json             | Yes\*    | `{}`     | JSON object keyed by display or internal name (Use JSON mode) |

> \* Required based on Field Input Mode selection.

**Field resolution:** Display names are automatically resolved to internal column names using the list's column schema. Person/Group fields accept an email address — the node resolves the SharePoint LookupId internally.

**Output:** The created item as returned by Graph (includes `id`, `fields`, `createdDateTime`, etc.).

---

### Item: Create or Update (Upsert)

Create a new item or update an existing one based on match criteria.

| Parameter            | Type             | Required | Default  | Description                                                    |
| -------------------- | ---------------- | -------- | -------- | -------------------------------------------------------------- |
| List                 | resource locator | Yes      | —        | Target list                                                    |
| Field Input Mode     | select           | Yes      | `fields` | Pick Fields or Use JSON                                        |
| Fields / Fields JSON | varies           | Yes      | —        | The field values to write                                      |
| Match Fields (JSON)  | json             | Yes      | `{}`     | Object of field:value pairs AND-composed into the match filter |

**Behaviour:**

1. The node queries the list using the match fields as a filter
2. If exactly one item matches, it's updated with the provided fields
3. If no item matches, a new item is created
4. If multiple items match, the node throws an error (ambiguous match)

---

### Item: Delete

Delete a list item by its ID.

| Parameter | Type             | Required | Default | Description        |
| --------- | ---------------- | -------- | ------- | ------------------ |
| List      | resource locator | Yes      | —       | Target list        |
| Item ID   | string           | Yes      | —       | The list item's ID |

**Output:** `{ "deleted": true, "id": "<itemId>" }`

---

### Item: Get

Fetch a single list item by ID.

| Parameter | Type             | Required | Default | Description                                               |
| --------- | ---------------- | -------- | ------- | --------------------------------------------------------- |
| List      | resource locator | Yes      | —       | Target list                                               |
| Item ID   | string           | Yes      | —       | The list item's ID                                        |
| Simplify  | boolean          | No       | `true`  | Flatten fields and re-key internal names to display names |

**Output (Simplify = true):**

```json
{
  "id": "42",
  "Title": "Record-123",
  "COORS #": "CO-2024-001",
  "Assigned To": "jane.doe@gov.bc.ca",
  "createdDateTime": "2024-06-15T10:30:00Z"
}
```

**Output (Simplify = false):** Raw Graph response with nested `fields` object using internal column names.

---

### Item: Get Many

Fetch multiple list items with optional filtering and pagination.

| Parameter    | Type             | Required | Default | Description                                                 |
| ------------ | ---------------- | -------- | ------- | ----------------------------------------------------------- |
| List         | resource locator | Yes      | —       | Target list                                                 |
| Filter Type  | select           | No       | `None`  | None, Simple (UI builder), or OData (raw filter expression) |
| Conditions   | fixed collection | Yes\*    | —       | Column/operator/value conditions (Simple mode)              |
| OData Filter | string           | Yes\*    | —       | Raw OData `$filter` expression (OData mode)                 |
| Return All   | boolean          | No       | `false` | Fetch all pages (ignores Limit)                             |
| Limit        | number           | No       | `50`    | Maximum items to return (when Return All = false)           |
| Simplify     | boolean          | No       | `true`  | Flatten fields and re-key internal names to display names   |

> \* Required based on Filter Type selection.

#### Simple Filter Operators

| Operator         | OData equivalent | Example                     |
| ---------------- | ---------------- | --------------------------- |
| Equals           | `eq`             | `Status eq 'Active'`        |
| Not Equals       | `ne`             | `Status ne 'Closed'`        |
| Greater Than     | `gt`             | `Priority gt 3`             |
| Greater Or Equal | `ge`             | `Created ge '2024-01-01'`   |
| Less Than        | `lt`             | `Priority lt 5`             |
| Less Or Equal    | `le`             | `Modified le '2024-12-31'`  |
| Starts With      | `startswith()`   | `startswith(Title, 'CO-')`  |
| Contains         | `contains()`     | `contains(Title, 'report')` |

Simple conditions are AND-composed. For OR logic or complex expressions, use OData mode.

---

### Item: Get Column Map

Retrieve the display-name → internal-name mapping for all columns in a list.

| Parameter | Type             | Required | Default | Description |
| --------- | ---------------- | -------- | ------- | ----------- |
| List      | resource locator | Yes      | —       | Target list |

**Output:**

```json
{
  "columnMap": {
    "Title": "Title",
    "COORS #": "OData__x0043_oors__x0023_",
    "Assigned To": "Assigned_x0020_To",
    "Date Received": "Date_x0020_Received"
  }
}
```

Use this to understand available columns and their internal names when building OData filters or debugging field mapping.

---

### Item: Update

Update an existing list item's fields by item ID.

| Parameter        | Type             | Required | Default  | Description                |
| ---------------- | ---------------- | -------- | -------- | -------------------------- |
| List             | resource locator | Yes      | —        | Target list                |
| Item ID          | string           | Yes      | —        | The list item's ID         |
| Field Input Mode | select           | Yes      | `fields` | Pick Fields or Use JSON    |
| Fields / JSON    | varies           | Yes      | —        | The field values to update |

Only the specified fields are updated; other fields remain unchanged (PATCH semantics).

---

## File Resource

Operate on files in a SharePoint document library.

### File: Download

Download a file's content as binary data.

| Parameter              | Type             | Required | Default | Description                                            |
| ---------------------- | ---------------- | -------- | ------- | ------------------------------------------------------ |
| Document Library       | resource locator | No       | Default | Target library (Default, From List, By Name, or By ID) |
| Item ID                | string           | Yes      | —       | The Graph drive-item ID of the file                    |
| Output Data Field Name | string           | No       | `data`  | Binary property name for the downloaded content        |

**Output:** Binary item with the file content, plus JSON metadata (`fileName`, `mimeType`).

---

### File: Upload

Upload a file to a document library. Files ≤ 4 MB use a simple PUT; larger files use Graph's resumable upload session.

| Parameter             | Type             | Required | Default | Description                                                     |
| --------------------- | ---------------- | -------- | ------- | --------------------------------------------------------------- |
| Document Library      | resource locator | No       | Default | Target library                                                  |
| Input Data Field Name | string           | Yes      | `data`  | Binary property name holding the file content                   |
| Folder Path           | string           | No       | (root)  | Server-relative path within the library, e.g. `Reports/2026`    |
| File Name             | string           | Yes      | —       | Destination file name                                           |
| Conflict Behaviour    | select           | No       | `Fail`  | Fail, Replace, or Rename when a file with the same name exists  |
| Create Parent Folders | boolean          | No       | `true`  | Automatically create intermediate folders if they don't exist   |
| Chunk Size (MiB)      | number           | No       | `5`     | Chunk size for large uploads (must be a multiple of 0.3125 MiB) |

**Output:** The Graph driveItem metadata of the uploaded file (includes `id`, `name`, `size`, `webUrl`).

---

### File: Update

Update a file's content, metadata, or both.

| Parameter             | Type             | Required | Default           | Description                                               |
| --------------------- | ---------------- | -------- | ----------------- | --------------------------------------------------------- |
| Document Library      | resource locator | No       | Default           | Target library                                            |
| Item ID               | string           | Yes      | —                 | The Graph drive-item ID of the file                       |
| Update Mode           | select           | Yes      | `Update Metadata` | Replace Contents, Update Metadata, or Both                |
| Input Data Field Name | string           | Yes\*    | `data`            | Binary property for new content (Replace Contents / Both) |
| Metadata (JSON)       | json             | Yes\*    | `{}`              | Graph driveItem fields to PATCH (Update Metadata / Both)  |

> \* Required based on Update Mode selection.

**Example metadata JSON:**

```json
{
  "name": "renamed-report.pdf",
  "description": "Updated quarterly report"
}
```

**Output:** The updated Graph driveItem metadata.

---

## List Resource

Operate on SharePoint lists within a site.

### List: Get

Fetch metadata for a single list.

| Parameter       | Type             | Required | Default | Description                                         |
| --------------- | ---------------- | -------- | ------- | --------------------------------------------------- |
| List            | resource locator | Yes      | —       | Target list (From List dropdown, By Name, or By ID) |
| Include Columns | boolean          | No       | `false` | Attach the display-name → internal-name column map  |

**Output:** List metadata from Graph (includes `id`, `displayName`, `description`, `webUrl`, `itemCount`). When Include Columns is true, a `columnMap` object is appended.

---

### List: Get Many

Enumerate lists on the site.

| Parameter            | Type    | Required | Default | Description                                       |
| -------------------- | ------- | -------- | ------- | ------------------------------------------------- |
| Include Hidden Lists | boolean | No       | `false` | Include system/hidden lists in results            |
| Include Columns      | boolean | No       | `false` | Attach column maps to each list                   |
| Return All           | boolean | No       | `false` | Fetch all lists (ignores Limit)                   |
| Limit                | number  | No       | `50`    | Maximum lists to return (when Return All = false) |

**Output:** Array of list metadata objects.

---

## User Resource

Operate on SharePoint site users (the User Information List).

### User: Get Lookup ID

Resolve an email address to the integer SharePoint LookupId needed for Person/Group fields.

| Parameter    | Type   | Required | Default | Description                                                |
| ------------ | ------ | -------- | ------- | ---------------------------------------------------------- |
| Email        | string | Yes      | —       | The user's email address                                   |
| On Not Found | select | No       | `Error` | Behaviour when the user isn't in the User Information List |

#### On Not Found Options

| Option          | Behaviour                                                                        |
| --------------- | -------------------------------------------------------------------------------- |
| Error           | Throw an error (default)                                                         |
| Continue (Null) | Return `{ email, lookupId: null }` — useful for conditional branching            |
| Ensure User     | Provision the user on the site via SharePoint REST, then return the new LookupId |

> **Ensure User** requires `Sites.Selected` on both the **Microsoft Graph** and **Office 365 SharePoint Online** resources in your app registration.

**Output:**

```json
{
  "email": "jane.doe@gov.bc.ca",
  "lookupId": 42
}
```

---

### User: Get Many

Enumerate users from the site's User Information List.

| Parameter               | Type    | Required | Default | Description                                                 |
| ----------------------- | ------- | -------- | ------- | ----------------------------------------------------------- |
| Exclude System Accounts | boolean | No       | `true`  | Filter out system and group principals, keeping only people |
| Return All              | boolean | No       | `false` | Fetch all users (ignores Limit)                             |
| Limit                   | number  | No       | `50`    | Maximum users to return (when Return All = false)           |

**Output:** Array of user objects (includes `id`, `loginName`, `title`, `email`, `principalType`).

---

## Field Input Modes

When writing item fields (Create, Update, Create or Update), two input modes are available:

### Pick Fields Mode

Use the n8n UI to select columns from a dropdown and fill values one by one. The dropdown is populated from the list's column schema via the resource mapper. This mode is ideal for:

- Simple forms with a few fields
- Exploring available columns
- Non-technical users

### Use JSON Mode

Provide a JSON object keyed by display name or internal name:

```json
{
  "Title": "New Record",
  "COORS #": "CO-2024-042",
  "Assigned To": "jane.doe@gov.bc.ca",
  "Date Received": "2024-06-15T00:00:00Z"
}
```

This mode is ideal for:

- Dynamic field values from upstream nodes
- Bulk operations with many columns
- Experienced users who know the column names

### Field Value Coercion

The node automatically coerces values based on the column's SharePoint type:

| Column type      | Input format              | Coercion                             |
| ---------------- | ------------------------- | ------------------------------------ |
| Person/Group     | Email string              | Resolved to `LookupId` integer       |
| DateTime         | ISO 8601 string           | Passed as-is (Graph handles parsing) |
| Number/Currency  | Numeric string or number  | Parsed to number                     |
| Boolean (Yes/No) | `true`/`false` or `1`/`0` | Coerced to boolean                   |
| Choice           | String value              | Validated against allowed choices    |
| Lookup           | Integer or numeric string | Passed as LookupId                   |

---

## Error Handling

The node supports n8n's **Continue On Fail** mode. When enabled:

- Failed items produce `{ "error": "error message" }` in the output instead of stopping the workflow
- Successfully processed items continue normally
- Each output item maintains proper item linking (`pairedItem`) for data tracing

Common error scenarios:

| Error                                   | Cause                                                           |
| --------------------------------------- | --------------------------------------------------------------- |
| 403 Forbidden                           | App lacks `Sites.Selected` access to the target site            |
| 404 Not Found (site)                    | Site URL is incorrect or site doesn't exist                     |
| 404 Not Found (list)                    | List name/ID doesn't match any list on the site                 |
| 404 Not Found (item)                    | Item ID doesn't exist in the list                               |
| 429 Too Many Requests                   | Graph throttling — the node auto-retries with backoff           |
| Multiple items matched for upsert       | Match fields in Create or Update are too broad                  |
| Invalid JSON in Fields                  | The Fields (JSON) parameter contains malformed JSON             |
| User not found in User Information List | Email doesn't exist on site; use Ensure User or Continue (Null) |

---

## Conditional Field Visibility

n8n's `displayOptions` controls which fields are shown in the UI based on the current resource and operation selections. Key visibility rules:

| Field              | Visible when                                   |
| ------------------ | ---------------------------------------------- |
| List (item)        | Resource = Item                                |
| Document Library   | Resource = File                                |
| Item ID            | Item: Get/Update/Delete, File: Download/Update |
| Field Input Mode   | Item: Create/Update/Create or Update           |
| Filter Type        | Item: Get Many                                 |
| OData Filter       | Item: Get Many + Filter Type = OData           |
| Simple Conditions  | Item: Get Many + Filter Type = Simple          |
| Simplify           | Item: Get / Get Many                           |
| Email              | User: Get Lookup ID                            |
| On Not Found       | User: Get Lookup ID                            |
| Conflict Behaviour | File: Upload                                   |
| Update Mode        | File: Update                                   |
| Include Columns    | List: Get / Get Many                           |
