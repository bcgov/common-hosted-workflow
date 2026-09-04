# BC Gov SharePoint — Custom n8n Node

The BC Gov SharePoint node reads and writes SharePoint list items, files, and lists via Microsoft Graph under BC Gov's **`Sites.Selected`** app-only permission model. It eliminates the nine-node HTTP/Code chain previously required for SharePoint operations in CCP workflows.

It supports four resources:

- **Item** — CRUD operations on SharePoint list items with automatic column name resolution
- **File** — Download, upload (simple + chunked), and update file content/metadata
- **List** — Retrieve list metadata and enumerate site lists
- **User** — Resolve emails to SharePoint lookup IDs and enumerate site users

## Overview

| Property        | Value                                               |
| --------------- | --------------------------------------------------- |
| Node name       | `bcGovSharePoint`                                   |
| Display name    | BC Gov SharePoint                                   |
| Style           | Programmatic (`execute()` method)                   |
| Version         | 1                                                   |
| Credential      | `bcGovSharePointOAuth2Api` (extends n8n OAuth2 API) |
| Category        | Transform                                           |
| AI-tool capable | Yes (`usableAsTool: true`)                          |
| Resources       | Item, File, List, User                              |

## Documentation Index

| Document                                | Description                                                |
| --------------------------------------- | ---------------------------------------------------------- |
| [Node Operations](./node-operations.md) | Detailed guide to every resource, operation, and parameter |
| [Credentials](./credentials.md)         | Azure AD setup, credential fields, and troubleshooting     |

## Source Files

```
community-nodes/
├── credentials/
│   └── BcGovSharePointOAuth2Api.credentials.ts   # OAuth2 credential definition
├── nodes/
│   └── BcGovSharePoint/
│       ├── BcGovSharePoint.node.ts               # Main node + execute dispatcher
│       ├── actions/
│       │   ├── file/                             # Download, Upload, Update
│       │   ├── item/                             # Create, CreateOrUpdate, Delete, Get, GetMany, Update
│       │   ├── list/                             # Get, GetMany
│       │   └── user/                             # EnsureUser, GetLookupId, GetMany
│       ├── methods/                              # loadOptions + resourceMapping
│       └── transport/                            # graphRequest, resolve, cache, coerce, simplify
└── tests/
    └── BcGovSharePoint/                          # Unit tests
```

## Quick Start

1. Configure the BC Gov SharePoint OAuth2 credential (see [Credentials](./credentials.md))
2. Drag "BC Gov SharePoint" into your workflow
3. Select a **Resource** (Item, File, List, or User)
4. Select an **Operation** (e.g. Create, Get Many, Upload)
5. Provide a **Site** (defaults to the credential's Default Site URL if left blank)
6. For Item operations, pick a **List** from the dropdown or enter by name/ID
7. For File operations, select a **Document Library** (or leave as Default)

## Key Features

### Automatic Column Resolution

Supply field values by **display name** — the node resolves internal names (e.g. `OData__x0043_oors__x0023_`) automatically. The renamed-Title quirk (`LinkTitle` → `Title`) is handled transparently.

### Person Field Resolution

Supply an **email address** for Person/Group fields — the node resolves the SharePoint `LookupId` internally. No more manual User Information List queries.

### Simplify Output

When enabled (default), Item Get/Get Many responses:

- Flatten `fields` to the item root
- Re-key internal names back to display names
- Result: `$json["COORS #"]` instead of `$json.fields.OData__x0043_oors__x0023_`

### Ensure User Fallback

If a person isn't found in the User Information List (they've never visited the site), the "Ensure User" option provisions them via SharePoint REST. Requires the `Sites.Selected` permission on the SharePoint resource in addition to Graph.

### Chunked Upload

Files larger than 4 MB are uploaded via Graph's resumable upload session protocol. Each chunk (default 5 MiB, configurable) is independently retried on transient failures.

### Resource Mapper & Dropdowns

- Item fields use the **resource mapper** widget — display names, types, required flags, and choice dropdowns are loaded from the list schema
- List and Document Library support a "From List" dropdown mode (resolves from the configured site)

### Metadata Caching

Site IDs, list IDs, and column maps are cached in a per-credential TTL cache (default 15 minutes) to reduce Graph API calls. The same cache backs both node execution and the Site/List/"Add Column" dropdowns, so opening the column picker repeatedly doesn't re-hit Graph every time. The cache can be refreshed via the **Refresh Metadata Cache** toggle — checking it busts the cache for the next execution _and_ the next dropdown open, which is useful right after adding, renaming, or removing a SharePoint column.

### Retry with Backoff

All Graph requests automatically retry on HTTP 429 (throttled) and 503 (service unavailable) responses, honouring the `Retry-After` header when present, otherwise using exponential backoff with jitter.

## Common Workflow Patterns

### Create a list item with person fields

1. Set Resource = Item, Operation = Create
2. Select the target List
3. Use "Pick Fields" mode and select the Person column
4. Enter the user's email — the node resolves it to a LookupId automatically

### Upsert (Create or Update) a list item

1. Set Resource = Item, Operation = Create or Update
2. Provide the field values (display name or internal name)
3. In "Match Fields (JSON)", specify the key fields to match on, e.g. `{"Title": "Record-123"}`
4. If a matching item exists, it's updated; otherwise a new item is created

### Upload a file to a document library

1. Set Resource = File, Operation = Upload
2. Provide the binary input field name (default: `data`)
3. Set the File Name and optional Folder Path
4. Choose Conflict Behaviour (Fail, Replace, or Rename)
5. For files > 4 MB, the chunked protocol is used automatically

### Download a file

1. Set Resource = File, Operation = Download
2. Provide the drive-item ID (from a previous Get Many or Graph query)
3. The file content is placed in the output binary field (default: `data`)

### Filter list items

1. Set Resource = Item, Operation = Get Many
2. Choose a Filter Type:
   - **Simple** — add conditions via the UI (column, operator, value)
   - **OData** — enter a raw OData `$filter` expression

## Known Limitations

- **Chunked upload auth header** — Graph's upload session URLs are pre-authenticated; the node currently sends a Bearer token on chunk PUTs which may be redundant. If you encounter 401 errors on large uploads, this is the likely cause — please report it.
- **No site enumeration** — `Sites.Selected` cannot list available sites. You must know your site URL upfront.
- **`$orderby`** — not yet exposed on Item Get Many (the underlying Graph call supports it).

## Further Reading

- [Microsoft Graph API — Sites](https://learn.microsoft.com/en-us/graph/api/resources/site) — Graph site resource documentation
- [Microsoft Graph API — List Items](https://learn.microsoft.com/en-us/graph/api/resources/listitem) — Graph list item operations
- [Sites.Selected Permission](https://devblogs.microsoft.com/microsoft365dev/controlling-app-access-on-specific-sharepoint-site-collections/) — How Sites.Selected scoping works
- [Graph Upload Session](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession) — Resumable upload protocol documentation
