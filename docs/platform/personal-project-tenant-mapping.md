---
title: Personal Project Tenant Mapping
sidebar_label: Personal Project Mapping
sidebar_position: 6
---

# Personal project tenant mapping

This document explains the special tenant mapping used for a user's personal `n8n` project.

## Why this exists

The codebase uses `tenant_project_relation` as the common way to map a tenant identifier to an `n8n` project.

That mapping is used for:

- CSTAR-backed team projects
- some UI tenant listing behavior
- WIL and tenant-scoped API lookups

Personal projects are not CSTAR tenants, but some flows still need them to participate in this same mapping model.

## Current behavior

When a user reaches a successful role-granting path:

- the platform creates the user and personal project if needed
- then assigns a generated UUID tenant ID to that personal project if it does not already have one

This now happens in both of these cases:

- access-request approval
- successful OIDC login when the user ends up with a valid global role

Important detail:

- this generated tenant ID is local to CHWF
- it is not a CSTAR tenant ID

## What it is used for

Today this mapping primarily supports internal consistency in tenant-aware UI and API flows.

It allows the personal project to appear in flows that expect a tenant-like identifier without pretending it is a real CSTAR tenant.

## What it is not

The personal project mapping is not:

- a CSTAR tenant record
- a CSTAR tenant membership
- evidence that the user belongs to any ministry or team tenant

## Comparison

| Project type                   | Tenant ID source          | Meaning                                           |
| ------------------------------ | ------------------------- | ------------------------------------------------- |
| personal project               | generated locally by CHWF | pseudo-tenant for the user's own personal project |
| team project synced from CSTAR | CSTAR tenant UUID         | real tenant-backed project mapping                |

## Why this matters

Without this distinction, it is easy to make incorrect assumptions such as:

- every row in `tenant_project_relation` comes from CSTAR
- every tenant shown in a UI list is a CSTAR tenant
- every tenant UUID can be dereferenced in CSTAR

Those assumptions are not always true because personal projects also use the same table.

## Operational guidance

- Treat personal-project tenant mappings as local implementation details.
- Treat CSTAR-backed tenant mappings as authoritative tenant/project relationships.
- When documenting or debugging tenant behavior, explicitly distinguish personal pseudo-tenants from CSTAR tenants.

## Related docs

- `docs/platform/authentication-and-authorization.md`
- `docs/platform/access-request.md`
- `docs/external-ui/tenant-project-sync.md`
