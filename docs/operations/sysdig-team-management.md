# Sysdig Team Management

Sysdig teams control **who can see what** in Sysdig: a team's membership defines its users and their
roles, and its scope defines which OpenShift namespaces' data those users can access.

Teams and memberships are managed with the **`SysdigTeam` custom resource**, reconciled by the
BC Gov Platform Services [sysdig-operator](https://github.com/bcgov/platform-services-sysdig/tree/main/sysdig-operator). You
declare the desired users and roles in an OpenShift namespace, and the operator creates the teams,
invites the users, and keeps memberships in sync.

As a consumer, you create or update a **custom resource (CR)** with `kind: SysdigTeam`, not the
cluster-wide **CustomResourceDefinition (CRD)**. Platform Services installs the CRD and operates the
controller; you do not need to supply a Sysdig API token in your manifest.

This is separate from, and complementary to, the Terraform-managed Sysdig resources in this
repository (dashboards, alerts, notification channels) — see [Sysdig](../technologies/sysdig.md).
Terraform provisions _what is monitored and who gets notified_; `SysdigTeam` provisions _the teams
and who can log in and use them_.

## What The Operator Creates

For a project set with prefix `<prefix>` (for example `b0c13b` or `c89a45`), a single `SysdigTeam`
resource produces:

| Resource            | Name                        | Details                                                  |
| ------------------- | --------------------------- | -------------------------------------------------------- |
| Sysdig Monitor team | `<prefix>-team`             | Namespace scope for tools, dev, test, and prod           |
| Sysdig Secure team  | `<prefix>-team-secure`      | Uses a project Secure zone when creating a new team      |
| Secure zone         | `<prefix>-team-secure-zone` | Namespace filter uses `contains` with the project prefix |
| Team memberships    | from `spec.team.users`      | Same users and roles are applied to **both** teams       |

Team names are **derived from the namespace**, not from the CR's `metadata.name`. You never set the
team name yourself.

New Monitor teams are scoped to `<prefix>-tools`, `<prefix>-dev`, `<prefix>-test`, and `<prefix>-prod`.
The Secure zone's `contains` filter is broader than an exact list of these four namespace names.
If a team already exists, the current operator reuses it without updating its description, scopes,
or zone association. This guide describes the current Go operator; check the installed API and
consult Platform Services if your cluster behaves differently.

## Prerequisites

- Log in to the correct OpenShift cluster with `oc` and confirm that the `SysdigTeam` API is available.
- You need permission to read, create, and update `sysdig-teams.ops.gov.bc.ca` in your tools namespace.
- The CR **must** be created in a namespace ending in `-tools` (for example `b0c13b-tools`). Otherwise
  the operator reports `NamespaceValidation: False` and does not provision the teams.
- Each user is identified by their **email address**. Users don't need a Sysdig account up front —
  the operator invites missing users and adds them once invited.

The examples below use `b0c13b-tools`. For the `c89a45` project set, substitute `c89a45` for `b0c13b`
in the namespace and description.

```bash
oc api-resources --api-group=ops.gov.bc.ca
oc auth can-i create sysdig-teams.ops.gov.bc.ca -n b0c13b-tools
oc auth can-i update sysdig-teams.ops.gov.bc.ca -n b0c13b-tools
oc -n b0c13b-tools get sysdig-teams.ops.gov.bc.ca
```

**Maintain one `SysdigTeam` resource per tools namespace.** If one already exists, update it rather
than creating another with a different name. Multiple CRs in the same namespace target the same
Sysdig teams and can overwrite each other's membership lists. Changing `metadata.name` is not a way
to rename a Sysdig team.

## Create A Team

Save the following as `sysdigteam.yaml`, replacing the example emails with actual team members.
Use the existing resource's name if one was found in the previous step.

```yaml
apiVersion: ops.gov.bc.ca/v1alpha1
kind: SysdigTeam
metadata:
  name: sysdig-team
  namespace: b0c13b-tools
spec:
  team:
    description: Sysdig team for the b0c13b OpenShift project set
    users:
      - name: jane.doe@gov.bc.ca
        role: ROLE_TEAM_EDIT
      - name: john.smith@gov.bc.ca
        role: ROLE_TEAM_READ
```

Validate the manifest against the installed schema, then apply it:

```bash
oc apply --dry-run=server -f sysdigteam.yaml
oc apply -f sysdigteam.yaml
oc -n b0c13b-tools get sysdig-teams.ops.gov.bc.ca sysdig-team -o yaml
```

Server-side validation checks the Kubernetes manifest, not the Sysdig API calls. Reconciliation is
asynchronous; check the status and the actual team memberships after applying.

### Configurable Fields

The user-configurable settings are `spec.team.description` and `spec.team.users`:

- `description` is used when creating a new team. Editing it triggers reconciliation but does not
  update an existing team's description in the current operator.
- Each `users` entry requires `name` (email) and `role`.
- There is no spec field for a Sysdig team ID, a custom team name, or a custom namespace scope.
- Do not submit `status`, team IDs, or finalizers in your manifest; the operator manages them.

## Roles

| Role                | Typical Use                             |
| ------------------- | --------------------------------------- |
| `ROLE_TEAM_READ`    | Viewing team data and dashboards        |
| `ROLE_TEAM_EDIT`    | Maintaining team dashboards and alerts  |
| `ROLE_TEAM_MANAGER` | Managing team settings; grant sparingly |

These are Sysdig team roles, not OpenShift RBAC roles. Start with the least privilege needed.
The CRD accepts role strings without validating them against an enum; use a supported role above.

## Manage Membership

All membership changes are made by editing `spec.team.users` and re-applying:

- **Add a user** — append an entry. The operator invites them to Sysdig if needed, then adds them to
  both teams.
- **Change a role** — edit the `role` value. The operator updates the membership in place.
- **Remove a user** — delete the entry. The operator attempts to remove their membership from both
  teams, except when their current Sysdig role is `ROLE_TEAM_MANAGER`.

**The users list is the complete desired membership, not an incremental add request.** Preserve all
members who should retain access. Users added manually in Sysdig but omitted from the CR may be
removed on the next reconciliation; an empty or omitted list can remove all non-manager members.

> **Warning: removing a manager from the list does not revoke their access.** The operator skips
> deletion of memberships whose current role is `ROLE_TEAM_MANAGER`. It can still attempt a role
> change for a user retained in the list. Coordinate manager removal with Platform Services and
> verify the outcome in Sysdig rather than assuming that a CR edit revoked access.

For a direct edit, use:

```bash
oc -n b0c13b-tools edit sysdig-teams.ops.gov.bc.ca sysdig-team
```

If you keep the manifest in version control, update it there and re-apply it instead, so a later
apply does not undo a direct cluster edit.

Reconciliation is triggered by **spec changes** (and deletion). Metadata-only edits such as labels or
annotations do not trigger a sync; returned reconciliation errors are retried with backoff. The
current operator does not schedule a periodic sync after a successful reconciliation.

## Verify The Result

Inspect conditions and IDs:

```bash
oc -n b0c13b-tools get sysdig-teams.ops.gov.bc.ca sysdig-team -o yaml
oc -n b0c13b-tools get sysdig-teams.ops.gov.bc.ca sysdig-team \
  -o jsonpath='{range .status.conditions[*]}{.type}{": "}{.status}{" — "}{.reason}{": "}{.message}{"\n"}{end}'
```

A successful reconciliation normally records positive IDs and a `Ready` condition like this
(example IDs only — do not copy this into your manifest):

```yaml
status:
  monitorTeamID: 23604
  secureTeamID: 23605
  conditions:
    - type: Ready
      status: 'True'
      reason: Reconciled
      message: Sysdig teams and memberships reconciled successfully
```

Also verify the users and roles in the `b0c13b-team` and `b0c13b-team-secure` teams in Sysdig. The
current operator logs some membership-add and membership-delete failures without returning an
error, so `Ready: True` alone does not prove every membership change succeeded. Ask Platform Services
to check operator logs if access does not match your manifest.

## Delete A Team

**Deleting the CR is a team decommissioning action, not a troubleshooting reset.** It requests
deletion of the managed teams and Secure zone and can disrupt access and monitoring integrations.
Confirm the impact with Platform Services before proceeding.

```bash
oc -n b0c13b-tools delete sysdig-teams.ops.gov.bc.ca sysdig-team
```

A finalizer keeps the CR present while the operator attempts cleanup. The operator deletes each team
using its stored status ID; if an ID is zero or absent, that team's deletion is skipped, so an
existing team may be left behind. Secure zone deletion is still attempted by its derived name in a
tools namespace, even when team IDs are missing.

If deletion is stuck, ask Platform Services to investigate. Do not manually remove finalizers or
patch team IDs: that can bypass cleanup or target the wrong team. Removing a user's team membership
does not delete their Sysdig account.

## Troubleshooting

Check the CR's conditions using the commands above. User lookup or invitation failures may only
appear in the operator logs, so an empty or unchanged status also warrants investigation.

- **API not found / `no matches for kind "SysdigTeam"`** — confirm the cluster and run
  `oc api-resources --api-group=ops.gov.bc.ca`. Platform Services must install the appropriate CRD
  and operator; do not install or modify the cluster-wide CRD yourself.
- **`Forbidden`** — request permission to manage the resource in your tools namespace.
- **`NamespaceValidation: False`** — use your project's `-tools` namespace. Namespaces cannot be
  changed on an existing object; coordinate cleanup before creating its replacement.
- **`SysdigCredentials: False`** — the operator is missing its environment credentials. Platform
  Services must fix this; adding a token to your CR will not help.
- **`TeamSyncFailed` / `MembershipSyncFailed`** — read the condition message and ask Platform
  Services to investigate the Sysdig API error if you cannot resolve it through the user list.
- **A user cannot access the team** — check their email, invitation status, and actual membership
  in the expected Sysdig team, then ask Platform Services to inspect logs if needed.

### `Team 0 was not found`

An error such as:

```text
Failed to sync Monitor team memberships: fetch monitor memberships: FetchTeamMemberships: status 404, body {"type":"resource_not_found","message":"Team 0 was not found","details":[]}
```

means the operator sent a membership request for team ID `0`. **There is no CR spec field you can
set to repair this.** Changing emails, roles, or the CR name does not correct team ID resolution.
In the current source, an existing-team lookup can return an unchecked ID; Platform Services needs
the deployed operator logs and API response to confirm the cause in your cluster.

Do not delete the existing Sysdig team, delete/recreate the CR, or manually patch `status` as a
workaround. These actions are not a confirmed fix and may disrupt access or leave unmanaged teams.

Report the issue to Platform Services with:

- Cluster, namespace, and CR name.
- The relevant manifest fields and `status.conditions` (redact personal emails in public reports).
- `status.monitorTeamID` and `status.secureTeamID`, including if they are absent or zero.
- Whether the derived team names already appear in Sysdig, and when you applied the CR.

Ask Platform Services to collect the operator logs and deployed image/version. Never include API
tokens or other secrets. Operator defects can be reported in
[bcgov/platform-services-sysdig](https://github.com/bcgov/platform-services-sysdig/issues).

## Related Documentation

- [Sysdig](../technologies/sysdig.md) — Terraform-provisioned dashboards, alerts, and notification
  channels for this repository's `b0c13b` and `c89a45` workspaces
- [Observability Dashboards](observability-dashboards.md) — Grafana-based n8n observability
- [SysdigTeam Schema](https://github.com/bcgov/platform-services-sysdig/blob/main/sysdig-operator/api/v1alpha1/sysdigteamgo_types.go)
  and [Operator Controller](https://github.com/bcgov/platform-services-sysdig/blob/main/sysdig-operator/internal/controller/sysdigteamgo_controller.go)
  — source for the resource fields and reconciliation behavior
