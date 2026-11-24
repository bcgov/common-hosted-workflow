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
3. The user lands on the portal home (`/ui/?session=<handle>`). When requesting access is the only thing they can do, the home page redirects them to the access-request page. Users holding the CSTAR `ui:actor` role stay on the portal home and open the access request from the menu when they want it (see [Portal-only access with `ui:actor`](#portal-only-access-with-uiactor)).
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
- `canRequestAccess` stays `true`: the **Access Request** menu item and home card are shown, but they are not redirected to that page after sign-in.
- every other capability (workflows, projects, sharing, admin) stays `false`.
- no `n8n` user is created, so the n8n editor stays closed and the "Open n8n" button is hidden.

Exceptions:

- a **disabled** `n8n` user stays blocked even with `ui:actor`, and keeps only the access-request capability.
- if the WIL feature flag is off, `ui:actor` grants nothing and the user falls back to the normal access-request flow.

### Requesting n8n access later

A portal-only user can submit an access request at any time. On approval they get `global:member`, an `n8n` account and a personal project, and they keep Workflow Interaction access. In `n8n` they see only their personal project: tenant team projects still require a CSTAR `project:editor` or `project:viewer` role, applied by tenant-project sync at the next sign-in.

### Revoking portal-only access

Portal-only users have no `n8n` user, so there is nothing to disable in `n8n`. Revoke access in the source systems:

- remove the `ui:actor` role (or the group that carries it) in CSTAR, or
- disable the identity in the upstream identity provider.

Tenant roles are cached for up to 1 hour (`TENANT_ROLES_DEFAULT_TTL_MS`), so an active session can keep portal access for up to an hour after the CSTAR change, or until the user signs in again.

## BCeID users

Access requests are for IDIR users only: approval provisions the user through an Azure IDIR lookup in CSS, which a BCeID identity cannot pass. When the session's claims contain `bceid_user_guid`, `canRequestAccess` is `false`, so the Access Request menu, home card and page are hidden and `POST /ui-api/access-requests` returns `403`.

| BCeID user's CSTAR roles            | Result                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `project:editor` / `project:viewer` | `global:member` at sign-in: `n8n` access, a personal project and the mapped tenant projects |
| `ui:actor` only                     | Workflow Interaction only, no Access Request option                                         |
| No tenant role                      | Home page shows "Join a tenant to get started" and no navigation options                    |

## Related docs

- `docs/platform/authentication-and-authorization.md`
- `docs/platform/global-roles-vs-cstar-roles.md`
- `docs/platform/cstar-role-mapping-rules.md`
- `docs/platform/personal-project-tenant-mapping.md`
