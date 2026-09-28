# Key Value Store credentials

Create a **Key Value Store** credential (`keyValueStore`). **Pairs** is a repeatable collection of **Key** (`name`) and **Value** (`value`) fields. Values are password-masked in the editor and must be strings; an empty string is a valid value when a key is present.

## Validation rules

| Configuration                                                                                         | Result                                                |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| No pairs configured, empty Pairs collection, or empty row list                                        | Valid empty configuration                             |
| Exact untouched UI row: Key `""`, Value `""`                                                          | Ignored placeholder, including between populated rows |
| Nonblank key and Value `""`                                                                           | Valid pair with an empty-string value                 |
| Empty key and populated value (even whitespace)                                                       | Error                                                 |
| Whitespace-only key, including with empty value                                                       | Error                                                 |
| Missing Key or Value field on a row                                                                   | Error; not an untouched placeholder                   |
| Nonstring key or value, including null, numbers, booleans, objects or arrays                          | Error; no coercion or JSON parsing                    |
| Exact key `__proto__`, `constructor` or `prototype`                                                   | Error; reserved in all output formats                 |
| Repeated exact key name                                                                               | Error in all formats, including Pairs Array Only      |
| Malformed Pairs container, non-array row list, non-object row, or unexpected fields inside Pairs/rows | Error; no silent filtering                            |

Names are compared exactly, case-sensitively, without trimming or Unicode normalization. Meaningful leading/trailing key whitespace is preserved: `"region"`, `" region "` and `"Region"` are distinct names. Reserved names are also exact matches; `" constructor "` is a distinct valid key. Other object-property names such as `toString` and `hasOwnProperty` are valid. All value whitespace is preserved, including whitespace-only values. The pairs array retains configured row order after removing blank placeholders; object-property iteration follows JavaScript rules (integer-like keys may enumerate first).

### Serialized shape

For workflow/credential tooling, the configured data has this shape:

```json
{
  "pairs": {
    "values": [
      { "name": "region", "value": "BC" },
      { "name": "optionalLabel", "value": "" }
    ]
  }
}
```

The intentionally empty shapes are `{}`, `{ "pairs": {} }`, and `{ "pairs": { "values": [] } }`, plus lists containing only exact blank placeholders. A missing credential object, `null`, an array in place of a collection object, or an explicitly supplied non-array `values` is invalid. Validation concerns the `pairs` field; unrelated top-level credential metadata is not projected. Only `values` is allowed inside `pairs`, and only `name`/`value` are allowed on rows.

Row errors identify the original **one-based row number**, including blank rows in the count, and the failed rule. Container errors identify the credential field. Validation messages never echo supplied names or values. Correct the credential and rerun; switching output formats does not bypass validation. See [error behavior](./node-operations.md#errors).

## Data exposure

Password masking only affects the credential editor. At execution, this node deliberately includes the actual strings in `values` and/or `pairs[*].value`. It declares those paths as sensitive output fields, but this metadata does not remove values from output or restrict downstream access. Values may appear in execution data/history and may be stored or transmitted by later nodes. Configure downstream handling and execution-data retention accordingly.

This credential stores reusable configuration, not per-item mutable state. There is no remote credential test or database service to authenticate against. The node reads the credential once per execution (using item-zero context for credential expressions), then projects the same validated configuration for every input item.
