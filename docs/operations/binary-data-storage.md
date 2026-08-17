# n8n Binary Data Storage

n8n workflows can produce and consume binary data when processing files such as documents, images, PDFs, email attachments, and files downloaded from external services. This binary data must be stored somewhere between nodes and across the workflow execution lifetime. This document describes how binary data storage is configured in Common Hosted Workflow and what operators need to know.

> **Note:** This document applies to the n8n version currently deployed by CHW. Binary data storage behavior and configuration can change between n8n releases. Review the n8n documentation when upgrading.

---

## Background: Why Binary Data Storage Matters in Queue Mode

n8n supports multiple binary data modes, including `default` (in-memory), `filesystem` (pod local disk), `database`, and `s3` (external object storage).

CHW runs n8n in queue mode (EXECUTIONS_MODE: queue), where execution jobs are processed by worker pods. Because worker pods have separate local filesystems, binary data stored only on a pod's local filesystem cannot be reliably shared when subsequent execution work runs on another pod. S3 provides shared external storage so binary data can be accessed by the different n8n instances processing the execution.

---

## OpenShift

OpenShift uses BC Gov's object storage service (`commonservices.objectstore.gov.bc.ca`) as the S3 backend.

### Environment Variables

Set in `helm/main/values.yaml` under `n8n.env` and applied to both the main and worker deployments automatically by the Helm chart:

| Variable                                | Value                                                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `N8N_DEFAULT_BINARY_DATA_MODE`          | `s3`                                                                                                                    |
| `N8N_EXECUTION_DATA_STORAGE_MODE`       | `s3`                                                                                                                    |
| `N8N_AVAILABLE_BINARY_DATA_MODES`       | `filesystem,s3`                                                                                                         |
| `N8N_EXTERNAL_STORAGE_S3_HOST`          | `commonservices.objectstore.gov.bc.ca`                                                                                  |
| `N8N_EXTERNAL_STORAGE_S3_PROTOCOL`      | `https`                                                                                                                 |
| `N8N_EXTERNAL_STORAGE_S3_BUCKET_NAME`   | `dev-external-storage` / `test-external-storage` / `prod-external-storage` — set per environment in the env values file |
| `N8N_EXTERNAL_STORAGE_S3_BUCKET_REGION` | `ca-central-1`                                                                                                          |

### Credentials

Access key and secret are injected from the `chwf-s3-account` Kubernetes secret via `n8n.extraEnv` in `helm/main/values.yaml`:

```yaml
N8N_EXTERNAL_STORAGE_S3_ACCESS_KEY:
  valueFrom:
    secretKeyRef:
      name: chwf-s3-account
      key: access-key
N8N_EXTERNAL_STORAGE_S3_ACCESS_SECRET:
  valueFrom:
    secretKeyRef:
      name: chwf-s3-account
      key: secret-key
```

The `chwf-s3-account` secret must exist in the namespace before deploying. Obtain credentials for the appropriate environment bucket and create the secret:

```
oc create secret generic chwf-s3-account \
  --from-literal=access-key=<key> \
  --from-literal=secret-key=<secret> \
  -n <namespace>
```

### Non-Standard Ports

For S3-compatible endpoints using a non-standard port, include the port in `N8N_EXTERNAL_STORAGE_S3_HOST` and set the protocol separately with `N8N_EXTERNAL_STORAGE_S3_PROTOCOL`. For example:

```
N8N_EXTERNAL_STORAGE_S3_HOST: "s3.example.internal:8333"
N8N_EXTERNAL_STORAGE_S3_PROTOCOL: "http"
```

---

## Operational Considerations

### Enterprise License Required

S3 binary data storage and S3 execution data storage are both n8n Enterprise features and require a valid Enterprise license. n8n will not start in `s3` mode for either feature without one.

If the Enterprise license is approaching expiration, renew it before expiry. Do not rely on automatic fallback behavior — n8n will refuse to start rather than silently downgrade to another mode.

### Binary Data is Not Auto-Pruned from S3

n8n prunes execution data according to the configured execution-pruning settings. For binary data stored in external S3 storage, n8n delegates object deletion to the S3 bucket lifecycle configuration. Without a lifecycle rule, binary objects can accumulate indefinitely.

A lifecycle rule is intentionally **not configured** on the s3 bucket for the following reasons:

- CHW has sufficient S3 capacity to allow accumulation.
- Workflows using wait mode (paused between steps) may be suspended for extended periods. If a lifecycle rule expired a binary file before the workflow resumed, n8n would fail to retrieve the file and the execution would error.

If storage costs become a concern in the future, a lifecycle rule set to a duration longer than the longest expected wait-mode pause can be considered, once the expected wait duration and retention requirements are known. Do not set it equal to `EXECUTIONS_DATA_MAX_AGE` without first confirming no active workflows are paused longer than that.

### Object Key Format

Binary files are stored at:

```
workflows/{workflowId}/executions/{executionId}/binary_data/{binaryFileId}
```

This path is managed entirely by n8n — do not rename or reorganise objects manually.

### Path-Style Requests

The BC Gov object-storage endpoint (`commonservices.objectstore.gov.bc.ca`) is compatible with path-style S3 URLs (`host/bucket/key`) and requires no additional n8n configuration.
