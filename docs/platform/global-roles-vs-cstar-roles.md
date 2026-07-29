---
title: Global Roles Versus CSTAR Roles
sidebar_label: Global Roles Vs CSTAR
sidebar_position: 5
---

# Global roles versus CSTAR roles

This document separates two different authorization layers that are easy to confuse.

## Short version

| Layer             | Scope         | Source                                                                           | Examples                                        |
| ----------------- | ------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| global `n8n` role | platform-wide | OIDC role claim, CSTAR managed project-role fallback, or access-request approval | `global:owner`, `global:admin`, `global:member` |
| CSTAR tenant role | tenant-scoped | CSTAR                                                                            | `project:editor`, `project:viewer`, `ui:actor`  |

## Global roles

Global roles are `n8n` user roles.

They determine baseline platform privileges such as:

- admin-only UI access
- admin-only custom API access
- access-request review
- other global permission checks in the UI

Current global roles:

- `global:owner`
- `global:admin`
- `global:member`

These roles are not tied to a specific tenant.

## CSTAR tenant roles

CSTAR tenant roles are per-tenant shared-service roles and groups.

They are used for:

- determining whether the user should be in a tenant's `n8n` team project
- determining whether the user should be `project:editor` or `project:viewer`
- role-based and group-based WIL actor matching
- tenant-scoped UI behavior

These roles are tenant-specific, not platform-wide.

## How they interact

The two layers are related but different.

- A user needs a usable global role to function normally in the platform.
- A user can receive `global:member` during login if they have any CSTAR managed project role in any tenant and no upstream global role was provided.
- CSTAR tenant data then determines which tenant projects that user can access.
- A user can be `global:member` and still have zero tenant projects.
- A user can belong to multiple CSTAR tenants and have different CSTAR roles in each one.

## Example

User `alex@gov.bc.ca`:

- global role: `global:member`
- CSTAR tenant A roles: `project:editor`, `ui:actor`
- CSTAR tenant B roles: `project:viewer`

Result:

- Alex can sign in and use the platform as a normal member.
- Alex becomes `project:editor` in tenant A's `n8n` team project.
- Alex becomes `project:viewer` in tenant B's `n8n` team project.
- Alex is not a platform admin.

## Common mistake to avoid

Do not use CSTAR tenant roles as if they were global platform roles.

Examples:

- `project:editor` does not make a user `global:admin`
- `global:member` does not guarantee access to any tenant team project
- `ui:actor` can matter for WIL matching without changing `n8n` project membership

## Related docs

- `docs/platform/authentication-and-authorization.md`
- `docs/platform/cstar-role-mapping-rules.md`
- `docs/external-ui/tenant-roles-in-session.md`
- `docs/external-ui/tenant-project-sync.md`
