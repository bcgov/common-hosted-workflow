# Custom Nodes — Conventions & Patterns

This guide describes the conventions and patterns used by the custom n8n nodes in [`community-nodes`](../../community-nodes). It is intended for anyone adding a new node, modifying an existing one, or doing a code review. Following these conventions keeps nodes consistent, testable, and compatible with the n8n-node toolchain.

## Repository Layout

All custom nodes live under a single pnpm package at `community-nodes/`:

```
community-nodes/
├── credentials/              # ICredentialType definitions, one file per credential
├── nodes/                    # INodeType definitions, one folder per node
│   └── <NodeName>/
│       ├── <NodeName>.node.ts       # Main node implementation
│       ├── <NodeName>.node.json     # Codex/category metadata (optional)
│       └── shared/                  # Internal helpers (GenericFunctions.ts, etc.)
├── icons/                    # SVG icons used by nodes and credentials
├── tests/                    # Vitest suites, one folder per node
├── dist/                     # Build output (gitignored)
├── package.json              # Package manifest with n8n node/credential entries
├── tsconfig.json
├── vitest.config.ts
└── eslint.config.mjs
```

The package is registered as an n8n community package via the `n8n` field in `community-nodes/package.json`. Every node and credential file **must** be added to the `n8n.nodes` and `n8n.credentials` arrays there, pointing at the compiled `.js` file under `dist/`.

## Package Conventions

- **Package name**: `community-nodes` (.keyword `bcgov-community-nodes`)
- **API version**: `n8nNodesApiVersion: 1`, `strict: false`
- **License**: `Apache-2.0`
- **Build tooling**: `@n8n/node-cli` powers `build`, `dev`, `lint`, and `lint:fix` scripts
- **Test runner**: Vitest (`pnpm test`), configured via `vitest.config.ts`
- **Peer dependency**: `n8n-workflow` — the runtime types nodes import from. Avoid adding runtime dependencies unless absolutely necessary; the lint rule `@n8n/community-nodes/no-runtime-dependencies` flags them.
- **Allowed runtime dependencies**: `sanitize-html` and `zod` are the only runtime dependencies. Add a new runtime dependency only after confirming it cannot be avoided.

## Node File & Folder Conventions

Each node lives in its own folder named with the node's display name (PascalCase, no spaces):

```
nodes/<NodeName>/<NodeName>.node.ts
nodes/<NodeName>/<NodeName>.node.json    (optional Codex metadata)
nodes/<NodeName>/shared/                 (optional helpers)
```

### Naming

| Convention                | Example               | Notes                                                                     |
| ------------------------- | --------------------- | ------------------------------------------------------------------------- |
| Folder name               | `OidcToken`           | PascalCase, matches the node's display name with spaces removed           |
| Source file               | `OidcToken.node.ts`   | `<FolderName>.node.ts`                                                    |
| `description.name`        | `oidcToken`           | camelCase unique identifier; used in `credentials: [{ name }]` references |
| `description.displayName` | `OIDC Token`          | Human-readable label shown in the n8n UI                                  |
| Class name                | `OidcToken`           | PascalCase, implements `INodeType`                                        |
| Codex metadata file       | `OidcToken.node.json` | Links the node to its docs category and declares `categories`             |

### Metadata file

Nodes optionally ship a `<NodeName>.node.json` describing the codex version and documentation link:

```json
{
  "node": "community-nodes.oidcToken",
  "nodeVersion": "1.0",
  "codexVersion": "1.0",
  "categories": ["Development", "Transform"],
  "resources": {
    "primaryDocumentation": [
      { "url": "https://github.com/bcgov/common-hosted-workflow/tree/main/docs/community-nodes/oidc-token" }
    ]
  }
}
```

The `resources.primaryDocumentation[0].url` should point to the matching docs subfolder under `docs/community-nodes/`.

## Node Description Shape

Every node class implements `INodeType` and exposes a `description: INodeTypeDescription`. The fields used consistently across this repo are:

```ts
export class MyNode implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'My Node',
    name: 'myNode',
    icon: { light: 'file:../../icons/<icon>.svg', dark: 'file:../../icons/<icon>.dark.svg' },
    group: ['transform'], // 'transform' | 'input' | etc.
    version: 1,
    subtitle: '={{$parameter["operation"]}}', // optional expression
    usableAsTool: true, // enable AI-tool usage unless there's a reason not to
    defaults: { name: 'My Node' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'myCredential', required: true }],
    properties: [
      /* ... */
    ],
  };
}
```

### Common `properties` patterns

- **Operation selectors**: an `options` type with `noDataExpression: true` named `operation` that drives conditional display of other properties via `displayOptions.show.operation`.
- **Conditional fields**: gate secondary fields with `displayOptions: { show: { operation: ['wait'] } }` (or any parent property).
- **Typed selects**: use `type: 'options'` with `name`/`value`/`description` per option.
- **JSON inputs**: use `type: 'json'` with a default like `'={}'` and a `hint` showing the expected shape; never use raw `string` for structured payloads.
- **Expressions**: prefix defaults that are expressions with `=`, e.g. `default: '={{ $json.body }}'`.
- **Required fields**: set `required: true` and `description` that explains what is expected.
- **Numeric bounds**: use `typeOptions: { minValue: 0, numberPrecision: 2 }` for numeric fields.

### Icons

- SVG icons live in `community-nodes/icons/`.
- Always provide a **light** and **dark** variant. The dark variant is named `<icon>.dark.svg`.
- Reference icons by relative path from the source file (e.g. `file:../../icons/my-node.svg` for nodes, `file:../icons/my-node.svg` for credentials).
- The `eslint-plugin-n8n-nodes-base` `icon-validation` rule is disabled in this repo, but you should still follow this convention.

## Credential Conventions

Credentials live in `community-nodes/credentials/` as `<Name>.credentials.ts`:

```
credentials/OidcToken.credentials.ts
```

Each credential class implements `ICredentialType`:

```ts
import { Icon, type ICredentialType, type INodeProperties } from 'n8n-workflow';

export class MyCredential implements ICredentialType {
  name = 'myCredential';
  icon: Icon = { light: 'file:../icons/<icon>.svg', dark: 'file:../icons/<icon>.dark.svg' };
  displayName = 'My Service';
  documentationUrl = 'https://github.com/bcgov/common-hosted-workflow/tree/main/docs/community-nodes/my-node';
  properties: INodeProperties[] = [
    /* ... */
  ];
}
```

Patterns to follow:

- **`name`** is camelCase and **must exactly match** the `name` referenced by nodes in their `credentials` array.
- **`documentationUrl`** points at the docs subfolder for the credential's associated node.
- **Secret fields** use `typeOptions: { password: true }`.
- **Required vs optional**: mark `required: true` for fields the node cannot function without (e.g. Client ID). Document why an apparently-required field is optional (e.g. Client Secret may be omitted for public clients on the Password grant).
- **Placeholders**: provide a realistic `placeholder` for URL/config fields so users can infer the expected shape.
- **Descriptions**: mention alternate fields ("Provide this OR the Token Endpoint") and which node behaviour each field is used by ("Only used when Grant Type is Password").

The credential file must be added to `n8n.credentials` in `community-nodes/package.json` (pointing at the compiled `dist/credentials/...js`).

## Convention: shared helpers

Reusable node logic lives in a `shared/` subfolder next to the node. The shared helpers are **not** exported as part of the node module surface — they are internal to the node.

Common patterns:

- `shared/GenericFunctions.ts` — HTTP helpers, validation, and pure logic (e.g. `resolveEndpoints`, `fetchToken`, `decodeJwt`).
- `shared/types.ts` — local type definitions shared across the node's helpers.
- `shared/properties.ts` — reusable property definitions when a node has many operations.
- `shared/<topic>.ts` — split by concern when the node is large (e.g. CHEFS, DevXMessageConnector), see `nodes/DevXMessageConnector/sources/shared/`.

Keep the `.node.ts` file focused on the `INodeTypeDescription` and the `execute()` / `webhook()` orchestration. Push logic into helpers so it can be unit tested independently.

## Execution Patterns

### Programmatic nodes (`execute()`)

Most nodes implement `async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>`.

Required conventions:

1. **Read inputs**: `const items = this.getInputData();`
2. **Read credentials**: `const credentials = (await this.getCredentials('<name>')) as unknown as <TypedShape>;`
3. **Validate early**: throw a `NodeOperationError` with a clear message before any network call when configuration is invalid.
4. **Loop with item index**: iterate `items` with `for (const [i] of items.entries())` and process each item independently.
5. **Per-item error handling**:
   ```ts
   try {
     /* ... */
   } catch (error) {
     if (this.continueOnFail()) {
       returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
       continue;
     }
     if ((error as Error & { response?: unknown }).response) {
       throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
     }
     throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
   }
   ```
6. **Enrich and emit**: use `this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(payload), { itemData: { item: i } })` to produce `INodeExecutionData`.
7. **Return shape**: return `[returnData]` — an array of arrays, per n8n convention.

### Webhook / waiting nodes (`webhook()`)

Nodes that pause and resume on incoming webhooks implement an additional `async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData>`.

Conventions:

- Declare `webhooks: [{ name, httpMethod, responseMode, responseData, path, restartWebhook }]` in the description.
- Use `waitingNodeTooltip` to surface the resume URL in the n8n UI while waiting.
- Put the workflow to wait with `this.putExecutionToWait(waitTill)`. Use a far-future date for indefinite waits, or compute a timeout from `timeoutAmount` + `timeoutUnit`.
- In the `webhook()` handler:
  - Read query/body via `this.getQueryData()` and `this.getBodyData()`.
  - Return `{ webhookResponse }` (with `restartWebhook: true`) when not all callbacks have arrived yet.
  - Return `{ webhookResponse, workflowData: [...] }` only when the wait is complete and the execution should resume.
- For multi-step waits that need crash-safe state, persist state externally via the external-hooks service (see `MultiWebhookWait`) and provide a downstream `Clear` operation to fetch partial status and clean up DB entries.
- The `@n8n/community-nodes/webhook-lifecycle-complete` lint rule may be disabled with an inline `// eslint-disable-next-line` comment when the lifecycle is intentionally handled across `execute()` and `webhook()`.

### Downstream `Clear` / status operations

Long-running or wait nodes should expose a secondary operation (e.g. `operation: 'clear'`) that returns the current completion status and removes persisted state. This pairs with the wait operation's timeout branch so timeouts produce an accurate partial-execution report.

## HTTP Requests

Use `this.helpers.httpRequest({ ... })` for all outbound HTTP calls. Conventions:

- Always set `method`, `url`, `headers` (including `Accept` and `Content-Type: application/json` where relevant), `body`, and `json: true`.
- For status-aware calls, set `returnFullResponse: true` and `ignoreHttpStatusErrors: true`, then branch on `response.statusCode` (e.g. treat `404` as "not found" instead of throwing).
- Wrap `httpRequest` in a `try/catch` and rethrow as `NodeOperationError` with:
  - A succinct message: `` `Failed to <action>: ${detail}` ``
  - A `description` that names the failing URL: `POST ${url} failed.`,
- Never `fetch()` directly or use third-party HTTP clients — `this.helpers.httpRequest` is the n8n-blessed path that respects proxy / retry config.

## Configuration From Environment

When a node needs runtime configuration (e.g. base URL, an internal auth token), read it from `process.env` with documented fallbacks:

```ts
const baseUrl = (process.env.N8N_BASE_URL ?? process.env.WEBHOOK_URL ?? '').replace(/\/$/, '');
const internalToken = process.env.INTERNAL_AUTH_TOKEN;
```

- Throw a `NodeOperationError` with both a `message` and a `description` when an env var is missing, so users can see exactly which variable to set.
- Document every env var the node reads in the node's docs README.
- Avoid env-based config when a credential field can serve the same purpose. Reserve env vars for values that must be consistent across executions within a deployment (base URL, internal service tokens).

## Error Handling & Validation Summary

| Situation                                    | Error type           | Notes                                                             |
| -------------------------------------------- | -------------------- | ----------------------------------------------------------------- |
| Invalid credential / missing required field  | `NodeOperationError` | Throw before any network call. Message should name the bad field. |
| Bad user input on the node UI                | `NodeOperationError` | Include `{ itemIndex: i }` when processing per-item.              |
| HTTP / API failure (response present)        | `NodeApiError`       | Lets n8n show status + body to the user.                          |
| HTTP / API failure without a response object | `NodeOperationError` | Fallback for transient transport errors.                          |
| Recovery on `continueOnFail()`               | —                    | Emit `{ json: { error }, pairedItem: { item: i } }` and continue. |

## TypeScript Configuration

`community-nodes/tsconfig.json` enforces strict mode. Conventions:

- `strict`, `strictNullChecks`, `noImplicitAny`, `noImplicitReturns`, `noUnusedLocals` are all on. Do not relax these.
- `target: 'es2019'`, `module: 'commonjs'` — match the n8n runtime.
- `useUnknownInCatchVariables: false` is set so `catch (error)` blocks treat `error` as `unknown` without forcing narrow casts; still prefer explicit `error as Error` casts.
- Output goes to `./dist/` and is emitted with declarations and source maps.
- `ignoreDeprecations: "6.0"` is set — keep it to silence known upstream deprecation warnings.

## Lint & Style

`community-nodes/eslint.config.mjs` is the source of truth. Highlights:

- Built on `@eslint/js` recommended + `typescript-eslint` recommended + `@n8n/eslint-plugin-community-nodes` `recommendedWithoutN8nCloudSupport`.
- `eslint-plugin-import-x` flat/recommended is applied for import ordering and resolution.
- `pluginN8nNodesBase` is registered, but most of its node/credential/community rules are **turned off** in the per-glob overrides. Before re-enabling any of them, confirm the existing nodes pass.
- `no-console: 'error'` for `**/*.ts` (logging in node code is forbidden — use throw or `continueOnFail` output). `no-console: 'off'` applies in `tests/**`.
- The `package.json` override block downgrades several community-package rules (`package-name-convention`, `valid-peer-dependencies`, `no-runtime-dependencies`, `require-community-node-keyword`). Do not add new exceptions without justification.

### Running lint

```sh
cd community-nodes
pnpm lint          # check
pnpm lint:fix      # auto-fix
pnpm build         # tsc -> dist/
```

## Testing Conventions

Tests live in `community-nodes/tests/<NodeName>/`, run with Vitest.

- One folder per node, matching the source node's folder name.
- A shared `helpers.ts` file per node provides mock construction and parameter wiring.
- Tests are split by behaviour or operation, one `.test.ts` per concern, e.g.:
  - `node.test.ts` — general routing / happy path
  - `text.test.ts`, `html.test.ts`, `github.test.ts`, `sysdig.test.ts`, … — per-source/per-mode suites
  - `error-handling.test.ts` — failure paths and `continueOnFail` behaviour
- Vitest configuration: `environment: 'node'`, `include: ['tests/**/*.test.ts']`, `clearMocks: true`, `restoreMocks: true`.

### Mocking `n8n-workflow`

Because `n8n-workflow` provides runtime classes, helpers mock the module at the top of `helpers.ts`:

```ts
import { vi } from 'vitest';

vi.mock('n8n-workflow', () => ({
  NodeConnectionTypes: { Main: 'main' },
  NodeApiError: class NodeApiError extends Error {
    /* ... */
  },
  NodeOperationError: class NodeOperationError extends Error {
    /* ... */
  },
}));

import { MyNode } from '../../nodes/MyNode/MyNode.node';
```

The mock must be in place **before** the node source is imported. Import the real node class afterwards.

### Building a mock execution context

Helpers expose a factory (commonly `createExecutionContext` or similar) that returns an object satisfying the `IExecuteFunctions` shape, with stubbed:

- `getInputData()` returning an array of items
- `getCredentials(name)` returning a typed credential object
- `getNodeParameter(name, itemIndex, fallback)` threaded from the test's `params`
- `helpers.httpRequest` as a `vi.fn` returning configured responses (and asserting on call args)
- `helpers.constructExecutionMetaData` / `returnJsonArray` as pass-throughs
- `continueOnFail()` defaulted to `false`
- `getNode()` returning a stub node object for `NodeApiError`/`NodeOperationError` constructors

### Test command

```sh
cd community-nodes
pnpm test                                  # all suites
pnpm exec vitest run tests/MyNode/foo.test.ts   # single file
```

### What to test

- Happy path per operation / mode / source
- Field-dependent display (`displayOptions`) when relevant
- Credential validation messages
- HTTP request shape (URL, method, headers, body) — assert on `httpRequest` mock args
- Error handling: `NodeApiError` for HTTP failures, `NodeOperationError` for validation, `continueOnFail`-on error items
- Edge cases: empty input arrays, missing optional fields, malformed JSON in dynamic inputs

## Documentation Conventions

Each node gets a docs subfolder under `docs/community-nodes/<kebab-case-name>/`:

```
docs/community-nodes/<node>/
├── _category_.json      # { "label": "<Display Name>", "position": <int> }
├── README.md            # Overview, source layout, quick start, links to other docs
├── architecture.md      # Design, data flow, error-handling model (optional)
├── node-operations.md   # Every property and operation documented (optional)
└── credentials.md       # Credential setup and field reference (optional)
```

Naming:

- Docs folder is **kebab-case** (`oidc-token`, `multi-webhook-wait`) — matches the URL in the credential's `documentationUrl` and the codex `resources.primaryDocumentation` URL.
- Source folder is **PascalCase** (`OidcToken`). The translation is mechanical.

Docs style (observed in this repo):

- Short intro paragraph, then sections with `##` headers.
- Use tables for property/mode/option references.
- Use fenced code blocks for file trees, payloads, and ASCII diagrams.
- Use ASCII diagrams for flow/architecture (see `architecture.md` files); avoid external image dependencies when an ASCII diagram works.
- When linking to GitHub assets, use the absolute `https://github.com/bcgov/common-hosted-workflow/tree/main/docs/community-nodes/<node>` URL pattern (matches the codex metadata).
- Per-node docs README links back to the Architecture / Node Operations / Credentials docs in the same folder.

The top-level `docs/community-nodes/_category_.json` sets the sidebar position; nested `_category_.json` files order each node's docs within the section.

## Checklist: Adding a New Node

Use this checklist when introducing a new custom node.

1. **Source**
   - [ ] `nodes/<NodeName>/<NodeName>.node.ts` implementing `INodeType`
   - [ ] `<NodeName>.node.json` Codex metadata with docs URL
   - [ ] `shared/` folder for helpers; node logic pushed out of `.node.ts`
   - [ ] Light + dark SVG icons in `icons/`
2. **Credentials** (if applicable)
   - [ ] `credentials/<Name>.credentials.ts` implementing `ICredentialType`
   - [ ] `name` matches the reference in the node's `credentials` array
   - [ ] Secret fields use `typeOptions: { password: true }`
3. **Package manifest**
   - [ ] Add `dist/nodes/<NodeName>/<NodeName>.node.js` to `n8n.nodes` in `package.json`
   - [ ] Add `dist/credentials/<Name>.credentials.js` to `n8n.credentials` in `package.json`
4. **Docs**
   - [ ] `docs/community-nodes/<node>/` folder with `_category_.json`, `README.md`
   - [ ] At minimum `architecture.md`, `node-operations.md`, `credentials.md` for non-trivial nodes
   - [ ] Credential `documentationUrl` and codex `primaryDocumentation` URL point at `<node>` docs folder
5. **Tests**
   - [ ] `tests/<NodeName>/` folder with `helpers.ts` and at least one `<topic>.test.ts`
   - [ ] Mock `n8n-workflow` before importing the node
   - [ ] Cover happy paths, validation errors, HTTP request shape, and `continueOnFail`
6. **Quality gates**
   - [ ] `pnpm lint` passes
   - [ ] `pnpm build` produces `dist/` with no type errors
   - [ ] `pnpm test` passes

## Existing Nodes Reference

| Folder                            | Node `name`                | Display Name               | Style        | Credential(s)                        |
| --------------------------------- | -------------------------- | -------------------------- | ------------ | ------------------------------------ |
| `nodes/CHEFS/`                    | `chefs`                    | CHEFS                      | Programmatic | `ChefsApi`, `ChefsFormAuth`          |
| `nodes/CHEFSResubmitWait/`        | `chefsResubmitWait`        | CHEFS Resubmit Wait        | Webhook/Wait | `ChefsApi`, `ChefsFormAuth`          |
| `nodes/CHEFSSubmissionExtractor/` | `chefsSubmissionExtractor` | CHEFS Submission Extractor | Programmatic | `ChefsApi`, `ChefsFormAuth`          |
| `nodes/DevXMessageConnector/`     | `devXMessageConnector`     | DevX Message Connector     | Programmatic | `DevXConnector`                      |
| `nodes/MultiWebhookWait/`         | `multiWebhookWait`         | Multi Webhook Wait Node    | Webhook/Wait | _(env-based: `INTERNAL_AUTH_TOKEN`)_ |
| `nodes/OidcToken/`                | `oidcToken`                | OIDC Token                 | Programmatic | `oidcToken`                          |
| `nodes/WorkflowInteractionLayer/` | `workflowInteractionLayer` | Workflow Interaction Layer | Programmatic | `WorkflowInteractionLayerApi`        |

See the per-node docs in each subfolder of `docs/community-nodes/` for node-specific design and usage.
