# Key Value Store

The **Key Value Store** node reads reusable string configuration from a **Key Value Store** credential and projects it into workflow data. It is a read-only credential projection, with no write, update, delete, lookup-by-key or TTL operations and no database connection.

## Quick start

1. Create a **Key Value Store** credential and add unique, nonblank **Key** names with string **Value** fields.
2. Select that credential on the **Key Value Store** node.
3. Choose **Both** (default), **Object Only**, or **Pairs Array Only** as the output format.
4. Connect an upstream item. Each input produces one paired output containing the same credential configuration.

For a pair with key `serviceUrl` and value `https://example.com`, the default output JSON is:

```json
{
  "values": { "serviceUrl": "https://example.com" },
  "pairs": [{ "name": "serviceUrl", "value": "https://example.com" }]
}
```

Use `{{$json.values.serviceUrl}}` downstream with **Both** or **Object Only**. Input JSON and binary data are replaced, not merged. Each output has independent copies of the object, array and pair objects.

**Credential values become downstream execution data.** Password masking in the credential editor and the node's sensitive-output metadata do not prevent subsequent nodes from reading, storing or sending these values. See [credentials and data exposure](./credentials.md#data-exposure).

## Guides

- [Output formats, pairing and errors](./node-operations.md)
- [Credential configuration and validation](./credentials.md)
- [Release notes and migration](./release-notes.md)

Node name and credential identifier remain `keyValueStore`, with node version `1`.
