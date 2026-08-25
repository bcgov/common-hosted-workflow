# BC Gov SharePoint — Custom n8n Node

A custom n8n community node for reading and writing SharePoint list items, files, and lists via Microsoft Graph under BC Gov's **`Sites.Selected`** app-only permission model. Replaces the nine-node HTTP/Code chain previously required for SharePoint operations in CCP workflows.

## Overview

| Property        | Value                                                  |
| --------------- | ------------------------------------------------------ |
| Node name       | `bcGovSharePoint`                                      |
| Display name    | BC Gov SharePoint                                      |
| Style           | Programmatic (`execute()` method)                      |
| Version         | 1                                                      |
| Credential      | `bcGovSharePointOAuth2Api` (extends n8n OAuth2 API)    |
| Category        | Transform                                              |
| AI-tool capable | Yes (`usableAsTool: true`)                             |
| Resources       | Item (7 ops), File (3 ops), List (2 ops), User (2 ops) |

## Documentation

Full documentation lives in [`docs/community-nodes/bcgov-sharepoint/`](../../../docs/community-nodes/bcgov-sharepoint/):

| Document                                                                             | Description                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| [README](../../../docs/community-nodes/bcgov-sharepoint/README.md)                   | Overview, quick start, key features, and architecture notes   |
| [Node Operations](../../../docs/community-nodes/bcgov-sharepoint/node-operations.md) | Detailed guide to every resource, operation, and parameter    |
| [Credentials](../../../docs/community-nodes/bcgov-sharepoint/credentials.md)         | Credential setup, Azure AD prerequisites, and troubleshooting |

## Source Files

```
community-nodes/
├── credentials/
│   └── BcGovSharePointOAuth2Api.credentials.ts   # OAuth2 credential (client credentials grant)
├── nodes/
│   └── BcGovSharePoint/
│       ├── BcGovSharePoint.node.ts               # Main node logic + execute dispatcher
│       ├── actions/
│       │   ├── file/
│       │   │   ├── download.ts                   # File: Download
│       │   │   ├── update.ts                     # File: Update (content/metadata/both)
│       │   │   └── upload.ts                     # File: Upload (simple + chunked)
│       │   ├── item/
│       │   │   ├── create.ts                     # Item: Create
│       │   │   ├── createOrUpdate.ts             # Item: Create or Update (upsert)
│       │   │   ├── delete.ts                     # Item: Delete
│       │   │   ├── get.ts                        # Item: Get
│       │   │   ├── getMany.ts                    # Item: Get Many (with filters)
│       │   │   └── update.ts                     # Item: Update
│       │   ├── list/
│       │   │   ├── get.ts                        # List: Get
│       │   │   └── getMany.ts                    # List: Get Many
│       │   └── user/
│       │       ├── ensureUser.ts                 # User: Ensure User (provision via REST)
│       │       ├── getLookupId.ts                # User: Get Lookup ID
│       │       └── getMany.ts                    # User: Get Many
│       ├── methods/
│       │   ├── loadOptions.ts                    # Dropdown loaders (lists, drives, columns)
│       │   └── resourceMapping.ts                # Resource mapper field definitions
│       └── transport/
│           ├── cache.ts                          # TTL cache for metadata
│           ├── coerce.ts                         # Field value coercion (person, date, etc.)
│           ├── graphRequest.ts                   # Authenticated Graph HTTP + retry logic
│           ├── resolve.ts                        # Site/List/Drive/Column ID resolution
│           └── simplify.ts                       # Output flattening + display-name re-keying
└── tests/
    └── BcGovSharePoint/
        └── *.test.ts                             # Unit tests
```

## Quick Start

1. Configure the credential (see [Credentials](../../../docs/community-nodes/bcgov-sharepoint/credentials.md))
2. Drag "BC Gov SharePoint" into your workflow
3. Select a **Resource** (Item, File, List, or User)
4. Select an **Operation** (e.g. Create, Get Many, Upload)
5. Choose a **Site** (defaults to the credential's Default Site URL)
6. For Item operations, select a **List** (from dropdown or by name/ID)
7. For File operations, select a **Document Library** (default or specific)

## Development

```bash
cd community-nodes
npx vitest run tests/BcGovSharePoint   # run tests
npx tsc --noEmit                        # type check
npm run lint                            # n8n community node linting
```
