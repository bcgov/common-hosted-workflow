# CHEFS release notes

## Review remediation — September 2026

### Local credential checks

Authorization Tokens now require **exact UTF-8 byte equality**, with an equal-length timing-safe comparison. Previously, the node lowercased and trimmed token values before comparison. Workflows relying on case-insensitive matching or ignored leading/trailing whitespace must align the node and credential tokens exactly before upgrading. Nonblank tokens with whitespace remain valid when that whitespace matches exactly; no Unicode normalization is performed.

Missing, nonstring, empty and whitespace-only tokens or API keys now fail locally before authorization headers are modified or a request is sent. In particular, matching whitespace-only tokens are no longer accepted, and missing API keys can no longer produce Basic credentials containing `undefined`. Errors do not echo the secret values.

The local shared-secret check and upstream Form ID/API-key Basic authentication remain separate. Valid API key bytes and Basic encoding are unchanged.

### Operation inputs

**Submission ID** is now shown and required only for **Submission → Get** and **Status → Get Submission Statuses**. **Status → Get Form Statuses** works without it, and ignores previously stored Submission ID values.

All operations enforce a nonblank string **Form ID** at the request boundary; both submission operations also enforce a nonblank string **Submission ID**. These checks cover invalid per-item expression results as well as static inputs. Identifiers are not trimmed or restricted to a new UUID grammar. Unsupported resource/operation selections reject locally.

### Compatibility

Node version `1`, node name `chefs`, credential `chefsApi`, credential and node property names, all three operation values (including `includeAuthorizationHeaderStatuses`), metadata identifier `n8n-nodes-chefs`, HTTP methods/paths and successful response handling are preserved. Node metadata and credential help now link to the [local guide](./README.md) and [credential setup](./credentials.md).
