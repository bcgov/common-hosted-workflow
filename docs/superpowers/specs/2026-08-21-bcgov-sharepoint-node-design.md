# BC Gov SharePoint Node — Repo Integration Design

**Status:** Approved for planning
**Source of truth for functional requirements:** `.kiro/specs/bc-gov-sharepoint-node/bcgov-sharepoint-node-requirements (1).md` (v0.1) and the accompanying mockup `bcgov-sharepoint-node-mockups (1).html`. This document does **not** restate those requirements; it defines how the node is built inside `community-nodes/` — package identity, file layout, conventions carried over vs. deviated from, and the phase-to-plan mapping.

## 1. Scope

Full node build covering requirements-doc Phases 1–3:

- Phase 1: Credential (client secret), resolution layer (`resolve.ts`), cache, `Item` (create, create-or-update, delete, get, get many, update), `User → Get Lookup ID`.
- Phase 2: `File` (download, update, upload incl. chunked), `List` (get, get many), `User → Get Many`.
- Phase 3: Certificate auth on the credential, `Ensure User` fallback, `Simplify`/AI-tool output shaping, README + BC Gov `Sites.Selected` grant documentation.

Phase 4 (trigger node, delta-polling) is explicitly out of scope — tracked as a separate ticket per the requirements doc.

## 2. Package & registration

| Item                      | Value                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Node file                 | `community-nodes/nodes/BcGovSharePoint/BcGovSharePoint.node.ts`                                            |
| Node class                | `BcGovSharePoint`                                                                                          |
| `displayName` / `name`    | `BC Gov SharePoint` / `bcGovSharePoint`                                                                    |
| Credential file           | `community-nodes/credentials/BcGovSharePointGraphApi.credentials.ts`                                       |
| Credential class / `name` | `BcGovSharePointGraphApi` / `bcGovSharePointGraphApi`                                                      |
| Icon                      | `community-nodes/icons/sharepoint.svg` + `sharepoint.dark.svg` (new — no existing SharePoint icon in repo) |

Both node and credential are registered in `community-nodes/package.json`'s `n8n.nodes` and `n8n.credentials` arrays (alphabetical insertion, matching existing entries — see `CDOGSOAuth2Api`/`CDOGSDocumentGenerator` as the template).

## 3. Credential — repo-fit detail

`BcGovSharePointGraphApi` follows the `CDOGSOAuth2Api` pattern: `extends = ['oAuth2Api']`, with hidden properties forcing the client-credentials flow (`grantType: clientCredentials`, `authentication: body`, `scope: https://graph.microsoft.com/.default`) plus the visible fields from requirements §5 (Authentication mode, Tenant ID, Client ID, Client Secret, Graph Base URL, Default Site URL, Metadata Cache TTL, Max Retries). Derived fields (`accessTokenUrl` built from Tenant ID) are computed the same way `CDOGSOAuth2Api` composes its token endpoint — not stored as a separate visible field.

Credential test overrides the default node-based test to hit `GET {graphBaseUrl}/sites/{hostname}:{path}` against **Default Site URL**, per requirements §5 — this needs a custom `test` implementation on the credential class rather than the generic `authenticate`-only pattern used by simpler credentials in this repo (`ChefsApi`, `OidcToken`), since those don't override `test`.

Phase 3 adds `Authentication = certificate` as an additional option value with its own conditional fields (Certificate Private Key, Certificate Thumbprint) — additive, not a breaking change to the Phase 1 shape, satisfying assumption A4.

## 4. File layout (approved deviation from repo norm)

```
nodes/BcGovSharePoint/
├── BcGovSharePoint.node.ts        # description + execute(): per-item loop, continueOnFail
├── actions/
│   ├── file/{download,update,upload}.ts
│   ├── item/{create,upsert,delete,get,getMany,update}.ts
│   ├── list/{get,getMany}.ts
│   └── user/{getLookupId,getMany}.ts
├── methods/
│   ├── loadOptions.ts              # list/drive/column/choice dropdowns
│   └── resourceMapping.ts          # getListColumns() -> ResourceMapperFields
└── transport/
    ├── graphRequest.ts             # httpRequestWithAuthentication + retry/backoff + paging
    ├── resolve.ts                  # site/list/drive/column/person/lookup resolution
    └── cache.ts                    # process-level TTL cache
```

This is a deliberate divergence from the repo's existing flatter `shared/` + `operations/` layout (CDOGS, WorkflowInteractionLayer). Justification: this node's resolution/caching/transport concerns are materially more complex than any existing node in the repo, and this layout matches n8n's own bundled SharePoint node's structure — recognizable to future maintainers and to n8n's own reviewers if the package is ever submitted for community verification (NFR1).

**Repository/service separation** (`coding-standards.md`) maps as:

- `transport/graphRequest.ts` = repository-equivalent — data access only, no business logic, no fallback decisions.
- `transport/resolve.ts` = service-equivalent — owns the business logic: filter-then-fallback-to-paged-enumeration strategy, `LinkTitle`→`Title` remap rule, ambiguity detection, person/lookup resolution orchestration.
- `actions/*` handlers are thin: parse parameters, call `resolve.ts`/`graphRequest.ts`, shape output. No resolution logic embedded in an action handler.

## 5. Conventions carried over unchanged

- `execute()` dispatch by `resource`/`operation`, per-item `try/catch`, `continueOnFail()` honored, `constructExecutionMetaData` + `pairedItem` for output linking (pattern from `WorkflowInteractionLayer.node.ts` / `CDOGSDocumentGenerator.node.ts`).
- Already-structured errors (`NodeApiError`/`NodeOperationError`) are rethrown unchanged rather than double-wrapped — the `isN8nError` guard from `CDOGSDocumentGenerator.node.ts` is reused verbatim.
- New errors follow the same two-class split: `NodeApiError` for Graph failures (preserving `error.code`/`request-id`), `NodeOperationError` for configuration/validation failures — with the actionable messages from requirements §10 built at the point each condition is detected, not generically.
- `axios`/native-fetch is **not** used for the Graph calls — per n8n convention (and consistent with every other node in this repo), all HTTP goes through `this.helpers.httpRequestWithAuthentication` so n8n's OAuth2 credential machinery handles token acquisition/refresh/caching, matching `CDOGSDocumentGenerator`'s `getConvertToOptions` use of the same helper. (The `coding-standards.md` axios rule targets `external-hooks`, a separate package with its own DI/service layer; it doesn't apply to n8n node HTTP calls, which must go through n8n's authenticated-request helper to get token handling for free.)
- Formatting/lint gate: `npx prettier --check`/`--write` and `npx eslint` (via `n8n-node lint`) run on every changed file before considering work done, per `coding-standards.md`.
- Magic strings (deny-list column names, error message templates, Graph scopes) as named constants in a `shared/constants.ts`-equivalent — here, colocated in `transport/resolve.ts` near their single point of use, since (unlike `external-hooks`) there's no cross-package `src/api/constants/` convention in `community-nodes`.

## 6. Testing (repo-fit detail on requirements §13)

- **Unit** (`vitest`, matches repo convention): column-map construction (read-only filtering, `LinkTitle`→`Title` remap, ambiguity), value coercion per column type, OData filter compilation, cache TTL/eviction, chunk-range arithmetic. Colocated as `*.test.ts` next to the module under test, or under `transport/__tests__/` if a module has many cases — follow whichever existing test layout `community-nodes` already uses once checked at implementation time.
- **Integration/Regression** (requirements §13 items 2–3): no existing in-repo pattern for a live-Graph-API test fixture. These are **not** automated in this pass — they become a documented manual verification checklist in the node's `README.md` (acceptance criteria AC1–AC10 mapped to manual steps against a real `Sites.Selected` dev site), consistent with how `CHEFSSubmissionExtractor` documents its own manual verification in its `README.md`.

## 7. Non-functional / acceptance criteria

Carried through unchanged from requirements §11–12 (NFR1–7, AC1–10) — no repo-specific reinterpretation needed; they're implementation-verifiable as written.

## 8. Open questions carried forward

Requirements §15 questions (app registration sharing model, client-secret vs. certificate mandate, `Ensure User` SharePoint-resource role availability, npm publish target, >5000-item list handling) are unresolved product/ops decisions, not engineering-design gaps. They don't block writing the implementation plan for Phases 1–3 as specified, but Q2 and Q3 directly gate whether Phase 3's certificate-auth and Ensure-User work items land as designed vs. need rework — flagged in the implementation plan as a checkpoint before starting those specific tasks.
