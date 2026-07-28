---
title: CSTAR Role Mapping Rules
sidebar_label: CSTAR Role Mapping
sidebar_position: 8
---

# CSTAR role mapping rules

This document describes how CSTAR tenant roles are currently interpreted by CHWF.

## Scope

This mapping applies to tenant-project sync and related `n8n` project membership logic.

It does not mean every CSTAR role is turned into an `n8n` project role.

## Current managed mapping

| CSTAR shared-service role | Resulting `n8n` project role |
| ------------------------- | ---------------------------- |
| `project:editor`          | `project:editor`             |
| `project:viewer`          | `project:viewer`             |
| any other role            | no managed project role      |

## Priority rule

If multiple qualifying roles are present for the same tenant:

1. `project:editor` wins
2. `project:viewer` is used only if editor is not present

## Unmapped CSTAR roles

Other CSTAR roles may still be useful elsewhere, but they do not currently change `n8n` project membership through tenant-project sync.

Examples include:

- UI-facing roles used for visibility logic
- WIL actor roles such as `ui:actor`
- any future CSTAR shared-service role that has not been explicitly mapped

## Consequences of an unmapped role

If a user has only unmapped CSTAR roles for a tenant:

- the sync does not assign `project:editor`
- the sync does not assign `project:viewer`
- the sync does not create a new tenant team project on that user's behalf

If a tenant project already exists and the user has no mapped role, the sync removes the user's managed relation if one exists.

## Why the mapping is narrow

The code intentionally keeps the project-role mapping small and explicit.

That reduces ambiguity between:

- tenant-scoped UI/WIL roles
- tenant-scoped `n8n` project access
- global platform roles

## Practical examples

| CSTAR roles in one tenant          | Result                        |
| ---------------------------------- | ----------------------------- |
| `project:viewer`                   | user becomes `project:viewer` |
| `project:editor`                   | user becomes `project:editor` |
| `project:viewer`, `project:editor` | user becomes `project:editor` |
| `ui:actor` only                    | no managed `n8n` project role |
| no roles                           | no managed `n8n` project role |

## Related docs

- `docs/platform/authentication-and-authorization.md`
- `docs/platform/global-roles-vs-cstar-roles.md`
- `docs/external-ui/tenant-project-sync.md`
- `docs/external-ui/tenant-roles-in-session.md`
