---
title: Failed Deployments
sidebar_label: Failed Deployments
sidebar_position: 4
---

# Failed Deployments

This guide addresses the common Helm error:
`Error: UPGRADE FAILED: another operation (install/upgrade/rollback) is in progress`.

## Root Cause

Helm uses release state stored in the cluster to track install and upgrade progress. If a deployment is interrupted, for example because a GitHub Actions job times out or is canceled, the release can remain stuck in `pending-install`, `pending-upgrade`, or `pending-rollback`.

In this repository the affected release name is typically `chwf`, because both `helm/main` and `helm/tools` deploy with that release name.

---

## Solution 1: OpenShift (OCP) Console

Use the Web Console for a visual way to revert the state.

1. **Navigate**: Log in to your OCP namespace.
2. **Locate Release**: From the left sidebar, go to **Helm** > **Helm Releases**.
3. **Select Target**: Click on the specific release name (e.g., `chwf`).
4. **History**: Open the **Revision History** tab.
5. **Rollback**: Identify the most recent revision with a **Deployed** status, then use the action menu to roll back.

6. **Retry**: Once the rollback completes, rerun your GitHub Action pipeline.

---

## Solution 2: Command Line Interface (CLI)

The CLI is often faster for developers comfortable with `helm`, `kubectl`, or `oc` contexts.

### 1. Check Current Status

Verify the release is stuck in a `pending` state:

```bash
helm status chwf -n <your-namespace>

```

### 2. View Revision History

List all revisions and identify the highest revision with status `DEPLOYED`:

```bash
helm history chwf -n <your-namespace>

```

> **Note:** If the failing deployment came from GitHub Actions, also inspect the workflow logs to confirm which image tag and target environment were being deployed.

### 3. Perform the Rollback

Revert the release to the stable revision:

```bash
# Syntax: helm rollback <release-name> <revision-number>
helm rollback chwf [REVISION_NUMBER] -n <your-namespace>

```

### 4. Verify

Confirm the status has returned to `DEPLOYED`:

```bash
helm status chwf -n <your-namespace>
```

## After Recovery

Before rerunning the workflow, confirm the basics:

- the namespace matches the intended GitHub Environment
- the image tag is correct for the target stage
- the cluster target is correct, typically `gold` or `golddr`
- no other deployment run is still active for the same environment

If the rerun fails after Helm is unlocked, the problem is likely with the chart inputs or the runtime state rather than the stale Helm operation itself.
