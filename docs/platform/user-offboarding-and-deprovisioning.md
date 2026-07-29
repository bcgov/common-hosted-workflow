---
title: User Offboarding And Deprovisioning
sidebar_label: Offboarding
sidebar_position: 7
---

# User offboarding and deprovisioning

This document summarizes what deprovisioning behavior is implemented today and where it is still incomplete.

## Short version

There is partial automated deprovisioning for tenant project membership, but not a single fully unified offboarding flow across OIDC, CSS SSO, CSTAR, and `n8n`.

## What is automated today

### 1. Tenant project relation cleanup

At login, tenant-project sync reconciles the user's current CSTAR tenant list against their existing managed `n8n` project relations.

If a user no longer belongs to a tenant in CSTAR:

- the sync removes their managed `project:editor` or `project:viewer` relation for that tenant project
- personal projects are preserved
- manually assigned non-managed project roles are preserved
- the global owner's `project:admin` relation is preserved

This is the strongest current automation in the offboarding story.

### 2. Handling users with no valid global role

When OIDC login resolves no usable global role and the configuration requires a role:

- the user can be disabled in `n8n`
- the user is redirected into the access-request path rather than treated as a normal active user

This is closer to access gating than full offboarding, but it is part of the lifecycle.

## What is not unified today

The codebase does not currently present one documented end-to-end offboarding workflow covering all of these at once:

- upstream identity removal or disablement
- CSS SSO role removal
- `n8n` global-role removal or disablement
- tenant-project relation cleanup across all affected tenants
- handling of personal projects after a user leaves
- notification or audit expectations for offboarding actions

## Practical interpretation

Today, offboarding is best understood as separate layers:

| Layer                              | Current behavior                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| OIDC identity                      | upstream concern                                                                                |
| CSS SSO global role                | can be assigned in approval flow; removal path is not documented here as an automated lifecycle |
| `n8n` global role / disabled state | controlled during login and access-request flows                                                |
| tenant project membership          | reconciled at login from CSTAR                                                                  |
| personal project                   | preserved unless handled manually outside the documented sync flow                              |

## Risks and gaps

- tenant membership cleanup happens on login, not as a separate immediate deprovisioning job
- a user who never logs in again may retain stale `n8n` managed project relations until another cleanup path exists
- manual or non-managed project roles are intentionally not removed by tenant sync
- personal project lifecycle after staff departure is not described in one place

## Recommended documentation mindset

When discussing offboarding, separate these questions:

1. Can the user still authenticate?
2. Does the user still have a global platform role?
3. Does the user still have any CSTAR tenant memberships?
4. Which `n8n` project relations are managed automatically versus manual?
5. What should happen to the user's personal project and its data?

## Related docs

- `docs/platform/authentication-and-authorization.md`
- `docs/platform/access-request.md`
- `docs/external-ui/tenant-project-sync.md`
