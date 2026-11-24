# Static workflow templates

This directory is the local n8n template library. It is read once when the
external-hooks templates router is constructed; no database or migration is
involved.

## Add a template

Create one directory per template:

```text
templates/
  my-template/
    template.json
  collections.json       # optional
```

`template.json` has three important parts:

- **Template metadata** — `id`, `name`, `description`, `createdAt`, `user`,
  `categories`, and optional `rank`, `totalViews`, and `image`.
- **`nodes`** — one display descriptor per distinct node type. These descriptors
  provide the icons shown in the template browser. `id`, `name`, and
  `displayName` are required; `name` is the n8n node type, such as
  `n8n-nodes-base.set`.
- **`workflow`** — the importable n8n graph, containing `nodes` and
  `connections`, plus optional `settings` and `meta`. Graph node `name` values
  must match the names used by `connections`.

Template and collection category IDs are required numbers. The search endpoint
filters templates by category **name**, while the collections endpoint filters
by category **ID**, so IDs must be stable and consistent across files.

`rank` controls the default curation order (lower values first, then template
ID). Search results can also be sorted by `views`, `createdAt`, or `name`.

## Public-data rules

The template endpoints are unauthenticated because the browser fetches them
directly. Treat every file here as public content.

- Do not include credentials, API keys, tokens, passwords, or private execution
  payloads in any field, including node `parameters` and descriptions.
- Node-level `credentials` are removed during validation, but this is not a
  general secret scanner.
- `workflow.pinData` is deliberately discarded. Pinned executions often contain
  production data and are never published by this library.
- Use resource-locator objects for nodes that require them, for example:

  ```json
  "documentId": { "__rl": true, "mode": "id", "value": "YOUR_SPREADSHEET_ID" }
  ```

## Collections

`collections.json` accepts `{ "collections": [...] }` (a bare array is also
accepted). Each collection has an `id`, `name`, `createdAt`, and `workflowIds`.
Unknown workflow IDs are logged and removed. If `nodes` is empty, the loader
builds a de-duplicated icon list from the member templates. Relative image URLs
are converted using `N8N_BASE_URL` for both templates and collections.

Malformed files are logged and skipped rather than preventing n8n from
starting. When duplicate template or collection IDs are found, the first entry
in deterministic file order wins and later entries are logged and skipped.

## Reload and validate

The image already contains these assets. Docker Compose also bind-mounts this
directory, so template-only changes only need:

```bash
cd docker-compose
docker compose restart n8n
```

Run the external-hooks tests after editing:

```bash
cd external-hooks
pnpm test tests/api/services/templates-library.test.ts tests/api/routes/templates.test.ts
```

The local browser is at `http://localhost:5678/templates/`, and the API root is
`http://localhost:5678/rest/custom/v1`.
