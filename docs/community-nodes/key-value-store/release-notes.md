# Key Value Store release notes

## Strict credential projection validation

This update intentionally changes validation for existing version 1 nodes. Previously, malformed containers and many invalid rows were silently treated as empty or dropped. Whitespace-only names could survive. These cases now fail with a field or one-based row error, without echoing credential names or values. There is no permissive compatibility mode or alias.

### Migration

1. Review every credential used by this node, including credentials imported through tooling. Restore the documented `pairs.values` array shape, remove unexpected nested fields, and supply string `name` and `value` fields on each row.
2. Remove unwanted rows or leave **both** fields exactly empty. A missing field, whitespace-only key, or empty key with a populated value is not a blank placeholder.
3. Give each populated row a nonblank, unique key. Rename exact reserved keys `__proto__`, `constructor` and `prototype`, and update downstream references. Previously filtered reserved rows now fail.
4. Convert intended nonstring values explicitly to strings in the credential. An empty-string value is valid and needs no replacement. The node does not coerce numbers/booleans or parse JSON.
5. Resolve duplicate names even when using **Pairs Array Only**. Duplicate names already failed during node setup; strict normalization now applies the same rule at the shared helper boundary. Duplicate errors now report the row rather than exposing the name.
6. Select one of the three supported formats in imported workflows. Invalid `outputFormat` values previously produced `{}`; they now fail instead.

Exact matching preserves meaningful key whitespace, case and Unicode representation, and all value whitespace. Only whitespace-only names are rejected; keys are not trimmed. Arrays keep row order after removal of exact blank placeholders.

### Preserved contracts

- Node and credential name `keyValueStore`, node version `1`, collection fields `pairs`/`values`/`name`/`value`, and format identifiers `both`/`object`/`array` remain unchanged.
- Successful shapes remain `{ values, pairs }`, `{ values }`, or `{ pairs }`, with one independently copied, paired item per input.
- Input JSON/binary is replaced, and empty configurations and valid empty-string values remain supported.
- Shared setup failures throw before projection, including with Continue On Fail; there is no new per-item error-output contract.
- Credential values are still actual downstream data despite editor password masking and sensitive-output metadata.

See [credential rules](./credentials.md), [output behavior](./node-operations.md), and the [overview](./README.md).
