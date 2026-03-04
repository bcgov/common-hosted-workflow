# Troubleshooting: Helm "Operation in Progress" Errors

This guide addresses the common Helm error:
`Error: UPGRADE FAILED: another operation (install/upgrade/rollback) is in progress`.

## Root Cause

Helm uses **Secrets** (or ConfigMaps) in the cluster to track release states. If a deployment is interrupted (e.g., a CI/CD runner times out or a manual cancelation occurs), the release state remains locked in `pending-install` or `pending-upgrade`, preventing further actions.

---

## Solution 1: OpenShift (OCP) Console

Use the Web Console for a visual way to revert the state.

1. **Navigate**: Log in to your OCP namespace.
2. **Locate Release**: From the left sidebar, go to **Helm** > **Helm Releases**.
3. **Select Target**: Click on the specific release name (e.g., `chwf`).
4. **History**: Open the **Revision History** tab.
5. **Rollback**:

- Identify the most recent revision with a **Deployed** status.
- Click the **Action menu (three dots)** and select **Rollback**.

6. **Retry**: Once the rollback completes, rerun your GitHub Action pipeline.

---

## Solution 2: Command Line Interface (CLI)

The CLI is often faster for developers comfortable with `kubectl` or `oc` contexts.

### 1. Check Current Status

Verify the release is stuck in a `pending` state:

```bash
helm status chwf -n <your-namespace>

```

### 2. View Revision History

List all attempts to find the last stable version:

```bash
helm history chwf -n <your-namespace>

```

> **Note:** Look for the highest revision number where the status is `DEPLOYED`.

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
