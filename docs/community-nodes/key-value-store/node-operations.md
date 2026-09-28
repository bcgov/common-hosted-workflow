# Key Value Store output formats

The node has one read/projection behavior and one option, **Output Format** (`outputFormat`). This option is execution-wide, has expressions disabled, and defaults to `both` when absent.

| UI selection     | Serialized value | Output JSON                                                                        |
| ---------------- | ---------------- | ---------------------------------------------------------------------------------- |
| Both             | `both`           | `{ "values": { "region": "BC" }, "pairs": [{ "name": "region", "value": "BC" }] }` |
| Object Only      | `object`         | `{ "values": { "region": "BC" } }`                                                 |
| Pairs Array Only | `array`          | `{ "pairs": [{ "name": "region", "value": "BC" }] }`                               |

**Object Only** retains the `values` wrapper; it does not put keys at the JSON root. **Pairs Array Only** retains the `pairs` wrapper; it does not emit one item per pair. All formats validate the complete credential, including duplicate and reserved names.

For intentionally empty credentials, `values` is `{}` and `pairs` is `[]`; each selected field is still present. Empty-string values on named pairs are preserved.

## Input, output and pairing

- Each input produces exactly one output item with `pairedItem: { item: inputIndex }` (zero-based).
- Output JSON replaces input JSON, and input binary data is not copied.
- Every item receives a fresh values object and/or pairs array, with fresh pair objects. Mutating one output does not mutate another output or the credential. In **Both**, changing `values` does not change `pairs`.
- Credentials and format are resolved once for the execution, not once per item.
- With zero input items, the node returns no output items after setup validation. Normal workflows need an upstream trigger/item to project configuration.

## Errors

Invalid populated credentials now fail instead of silently dropping entries. Row errors include the original one-based row index, for example `Key Value Store credential row 3: Value must be a string`. Duplicate errors omit the key name as well as all values. See the [credential validation matrix](./credentials.md#validation-rules).

The format must be exactly `both`, `object` or `array`. Unknown values, casing/whitespace variants and nonstring values fail with `Output Format (outputFormat) must be both, object, or array`; the supplied value is not echoed. Imported workflows with invalid selections must be corrected rather than relying on empty output JSON.

Credential retrieval, validation and format selection are **execution-wide setup**. Failure throws before any projected output is created, including when Continue On Fail is enabled. The node does not turn these failures into one error item per input or partially project valid rows; n8n's outer execution/error handling still applies. This retains the existing setup-failure policy for duplicate credentials. Successful outputs retain pairing in every format.

There are no write, update, delete, TTL or lookup operations. To change the shared configuration, edit the credential, then execute again. See [release notes](./release-notes.md) before upgrading existing configurations.
