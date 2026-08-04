# CDOGS Document Generator — Custom n8n Node

The CDOGS Document Generator node interacts with the [Common Document Generation Service (CDOGS)](https://bcgov.github.io/common-service-showcase/services/cdogs.html) API to generate documents from templates. It supports uploading templates, managing cached templates, and rendering documents to various output formats (PDF, DOCX, HTML, etc.).

## Overview

| Property        | Value                                           |
| --------------- | ----------------------------------------------- |
| Node name       | `cdogs`                                         |
| Display name    | CDOGS                                           |
| Style           | Programmatic (`execute()` method)               |
| Version         | 1                                               |
| Credential      | `oAuth2Api` (built-in n8n OAuth2 API)           |
| Category        | Utility                                         |
| AI-tool capable | Yes (`usableAsTool: true`)                      |
| Operations      | 6 (see [Node Operations](./node-operations.md)) |

## Documentation Index

| Document                                | Description                                          |
| --------------------------------------- | ---------------------------------------------------- |
| [Node Operations](./node-operations.md) | Detailed guide to every operation and its parameters |
| [Credentials](./credentials.md)         | How to configure the OAuth2 credential for CDOGS     |

## Source Files

```
community-nodes/
├── nodes/
│   └── CDOGSDocumentGenerator/
│       ├── CDOGSDocumentGenerator.node.ts   # Main node logic
│       ├── CDOGSDocumentGenerator.node.json # Codex metadata
│       └── shared/
│           └── GenericFunctions.ts          # HTTP helper functions
```

## Quick Start

1. Configure an OAuth2 API credential for CDOGS (see [Credentials](./credentials.md))
2. Drag the "CDOGS" node into your workflow
3. Set the **Base URL** (defaults to `https://cdogs.api.gov.bc.ca/api/v2`)
4. Choose an **Operation** (e.g., "Generate from Inline Template")
5. Provide template data and options as required by the operation

## Common Workflow Patterns

### Generate a PDF from an HTML template

1. Use "Generate from Inline Template" operation
2. Set Template Source to "Text Content"
3. Paste your HTML template with `{{variable}}` placeholders in Template Content
4. Provide the data JSON (e.g., `{"name": "John", "date": "2024-01-01"}`)
5. Set Convert To = "PDF"

### Upload and reuse a DOCX template

1. Use "Upload Template" to store a `.docx` template → receive a template hash
2. Use "Generate from Existing Template" with that hash to render documents repeatedly
3. The template stays cached on CDOGS, avoiding repeated uploads

### Check if a template is still cached

1. Use "Check Template Exists" with the template hash
2. If not found, re-upload before rendering

## Further Reading

- [CDOGS Service Documentation](https://bcgov.github.io/common-service-showcase/services/cdogs.html) — Full documentation for the Common Document Generation Service, including API reference, template syntax, and supported formats
- [Carbone.js Template Syntax](https://carbone.io/documentation.html) — CDOGS uses Carbone for template rendering
- [BC Gov CSS (Common Single Sign-On)](https://bcgov.github.io/sso-requests) — Where to provision service account credentials
