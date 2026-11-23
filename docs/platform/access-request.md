---
title: Access Request
sidebar_label: Access Request
sidebar_position: 4
---

# Access request

This document describes the initial access-request flow for users who can authenticate with OIDC but do not yet have a usable global `n8n` role after both the upstream OIDC role check and the CSTAR managed project-role fallback check.

## Purpose

The access-request flow grants baseline platform access.

On approval, the user receives:

- global role `global:member`
- an enabled `n8n` user account
- a personal project if they do not already have one

It does not grant access to any CSTAR-backed tenant team project by itself.

## When this flow is used

This flow is used when the user can sign in through OIDC but the callback does not resolve a valid global role for them from either the upstream OIDC role claim or CSTAR managed project roles.

Typical cases:

- the user has no mapped upstream role and `SSO_RESTRICT_NO_ROLE=true`
- the user has no CSTAR managed project role in any tenant
- the user exists but currently has no global role
- the user exists but is disabled because they previously had no valid role

## End-to-end flow

1. The user signs in through OIDC.
2. The callback resolves identity but not a usable global `n8n` role from either upstream OIDC data or the CSTAR managed project-role fallback.
3. The user is redirected to the access-request page. Users holding the CSTAR `ui:actor` role are redirected on to the portal home instead (see [Portal-only access with `ui:actor`](#portal-only-access-with-uiactor)).
4. The user submits a justification.
5. A `global:owner` or `global:admin` reviews the request.
6. If approved, the platform assigns `global:member` and enables the user.
7. On the next successful sign-in, the user enters the platform as a normal member.

## Who can do what

| Actor                            | Capability                      |
| -------------------------------- | ------------------------------- |
| requester                        | submit their own access request |
| `global:owner` or `global:admin` | list and review access requests |
| non-admin users                  | cannot review requests          |

## API surface

The UI API exposes these routes:

- `POST /ui-api/access-requests`
- `GET /ui-api/access-requests/my`
- `GET /ui-api/access-requests`
- `POST /ui-api/access-requests/:id/review`

Behavior:

- create is gated by `canRequestAccess`
- list and review are gated by `global:owner` or `global:admin`
- duplicate pending requests are rejected

## Approval side effects

When a request is approved, the system performs these actions:

1. Ensures required CSS SSO roles exist.
2. Looks up the Azure IDIR user.
3. Assigns `global:member` in CSS SSO.
4. Creates the `n8n` user and personal project if missing.
5. If the user exists but has no role, sets their `n8n` role to `global:member`.
6. If the user is disabled, re-enables them.
7. Ensures the personal project has a generated tenant mapping.

This makes the approved user a baseline platform member.

## Notifications

If mail is configured:

- admins are notified when a new access request is submitted
- the requester is notified on approval
- the requester is notified on denial, including the deny reason when provided

## Important boundaries

- Access request controls global platform access when the normal OIDC and CSTAR fallback paths did not already grant it.
- Approval does not create or sync CSTAR tenant team-project memberships.
- Tenant project access still depends on the normal CSTAR tenant-project sync flow after login.

## Portal-only access with `ui:actor`

A user who holds the CSTAR `ui:actor` role in any tenant, but has no usable global `n8n` role, gets **Workflow User Portal access only**:

- `canManageWil` is `true`: they can use Workflow Interaction (actions and messages matched to their email, roles and groups).
- `canRequestAccess` is `false`: the access-request page and nav item are hidden and `POST /ui-api/access-requests` returns `403`.
- every other capability (workflows, projects, sharing, admin) stays `false`.
- no `n8n` user is created, so the n8n editor stays closed and the "Open n8n" button is hidden.

Exceptions:

- a **disabled** `n8n` user stays blocked even with `ui:actor`, and keeps only the access-request capability.
- if the WIL feature flag is off, `ui:actor` grants nothing and the user falls back to the normal access-request flow.

For these users, n8n access comes from a CSTAR managed project role (`project:editor` / `project:viewer`), which grants `global:member` at the next sign-in. It does not come from an access request.

### Revoking portal-only access

Portal-only users have no `n8n` user, so there is nothing to disable in `n8n`. Revoke access in the source systems:

- remove the `ui:actor` role (or the group that carries it) in CSTAR, or
- disable the identity in the upstream identity provider.

Tenant roles are cached for up to 1 hour (`TENANT_ROLES_DEFAULT_TTL_MS`), so an active session can keep portal access for up to an hour after the CSTAR change, or until the user signs in again.

## Related docs

- `docs/platform/authentication-and-authorization.md`
- `docs/platform/global-roles-vs-cstar-roles.md`
- `docs/platform/cstar-role-mapping-rules.md`
- `docs/platform/personal-project-tenant-mapping.md`
