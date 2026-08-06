# Node Operations

This document describes every operation and parameter available in the CDOGS Document Generator node.

## Common Parameters

These parameters are always visible regardless of the selected operation:

| Parameter | Type   | Required | Default                                  | Description                            |
| --------- | ------ | -------- | ---------------------------------------- | -------------------------------------- |
| Base URL  | string | Yes      | `https://cdogs-dev.api.gov.bc.ca/api/v2` | The base URL of the CDOGS API endpoint |
| Operation | select | Yes      | `Health Check`                           | The operation to perform               |

---

## Operations

### Health Check

Check the health status of the CDOGS API.

**API endpoint:** `GET /health`

**Parameters:** None (only Base URL).

**Output:** JSON object with the API health status.

```json
{
  "dependencies": [...],
  "status": "ok"
}
```

---

### Upload Template

Upload a template file to CDOGS and receive a reusable template hash.

**API endpoint:** `POST /template`

**Parameters:**

| Parameter             | Type              | Required | Default | Description                                                 |
| --------------------- | ----------------- | -------- | ------- | ----------------------------------------------------------- |
| Input Data Field Name | string/expression | Yes      | `data`  | Binary property name or expression resolving to binary data |

**Input:** A binary item containing the template file (e.g., `.docx`, `.xlsx`, `.pptx`, `.html`). The node sends it as the required multipart field named `template`.

**Output:** JSON object containing the template hash.

```json
{
  "hash": "abc123def456...",
  "cached": false
}
```

The hash is extracted from the `x-template-hash` response header. If the identical file is already cached, the node returns its hash with `"cached": true` instead of failing on CDOGS's HTTP 405 response. Use the hash in subsequent "Generate from Existing Template" or "Check Template Exists" operations.

---

### Check Template Exists

Check whether a previously uploaded template is still cached on the CDOGS server.

**API endpoint:** `GET /template/{hash}`

**Parameters:**

| Parameter     | Type   | Required | Default | Description                             |
| ------------- | ------ | -------- | ------- | --------------------------------------- |
| Template Hash | string | Yes      | —       | The hash (uid) of the uploaded template |

**Output:** JSON response from CDOGS indicating the template status.

---

### Remove Template

Delete a previously uploaded template from the CDOGS cache.

**API endpoint:** `DELETE /template/{hash}`

**Parameters:**

| Parameter     | Type   | Required | Default | Description                              |
| ------------- | ------ | -------- | ------- | ---------------------------------------- |
| Template Hash | string | Yes      | —       | The hash (uid) of the template to remove |

**Output:**

```json
{
  "deleted": true
}
```

---

### Generate from Existing Template

Render a document using a previously uploaded template hash and a JSON data payload.

**API endpoint:** `POST /template/{hash}/render`

**Parameters:**

| Parameter                | Type            | Required | Default | Description                                           |
| ------------------------ | --------------- | -------- | ------- | ----------------------------------------------------- |
| Template Hash            | string          | Yes      | —       | The hash of the cached template                       |
| Template Data (JSON)     | json/expression | Yes      | `{}`    | JSON text or expression returning an object/array     |
| Enable Custom Formatters | boolean         | No       | `false` | Send custom TeleJSON formatters to CDOGS              |
| Custom Formatters (JSON) | json            | Yes\*    | `{}`    | Formatter map used when custom formatters are enabled |
| Convert To               | select          | Yes      | `PDF`   | Output formats loaded from the CDOGS `/fileTypes` API |
| Report Name              | string          | No       | —       | Output filename (without extension)                   |
| Output Data Field Name   | string          | No       | `data`  | Binary output field name for the generated document   |

> \* Required when **Enable Custom Formatters** is selected.

**Output:** Binary item containing the rendered document in the specified format.

**Example data JSON:**

```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "invoiceDate": "2024-03-15",
  "items": [
    { "description": "Widget A", "qty": 2, "price": 10.0 },
    { "description": "Widget B", "qty": 1, "price": 25.0 }
  ]
}
```

The field also accepts an expression that returns an object directly, for example `{{ $json.templateData }}`. You do not need to call `JSON.stringify()`.

---

### Generate from Inline Template

Render a document by supplying the template content directly (no pre-upload required).

**API endpoint:** `POST /template/render`

**Parameters:**

| Parameter                      | Type              | Required | Default        | Description                                                 |
| ------------------------------ | ----------------- | -------- | -------------- | ----------------------------------------------------------- |
| Template Source                | select            | Yes      | `Binary Input` | Where to get the template: Binary Input or Text Content     |
| Template Input Data Field Name | string/expression | Yes\*    | `template`     | Binary property name or expression resolving to binary data |
| Template Content               | string            | Yes\*    | —              | Text content of the template (Text mode only)               |
| Content File Type              | select            | Yes\*    | `HTML`         | File type of the text content (Text mode only)              |
| Template Data (JSON)           | json/expression   | Yes      | `{}`           | JSON text or expression returning an object/array           |
| Enable Custom Formatters       | boolean           | No       | `false`        | Send custom TeleJSON formatters to CDOGS                    |
| Custom Formatters (JSON)       | json              | Yes\*    | `{}`           | Formatter map used when custom formatters are enabled       |
| Convert To                     | select            | Yes      | `PDF`          | Output formats loaded from the CDOGS `/fileTypes` API       |
| Report Name                    | string            | No       | —              | Output filename (without extension)                         |
| Overwrite Cached Template      | boolean           | No       | `true`         | Allow an identical inline template to replace cached data   |
| Output Data Field Name         | string            | No       | `data`         | Binary output field name for the generated document         |

> \* Conditional — required when its related source or enable option is selected.

The **Convert To** dropdown calls the authenticated `GET /fileTypes` endpoint. For Text Content it filters conversions using **Content File Type**. For Binary Input and cached templates, n8n cannot inspect the source extension while loading editor options, so the dropdown shows the unique output formats returned by CDOGS. The API still validates the actual input/output combination when the node executes.

Selecting **None (Same Format)** preserves the detected inline template extension. For example, a DOCX Binary Input produces a `.docx` binary output rather than a generic `.bin` file.

**Output:** Binary item containing the rendered document.

#### Template Source: Binary Input

Read the template from a binary input field. The file type is auto-detected from the file extension. Supports `.docx`, `.xlsx`, `.pptx`, `.html`, `.txt`, and other formats supported by CDOGS.

You can enter the current item's binary property name, such as `template_file`, or use an expression that resolves to binary data from another node, such as `{{ $('Target Node').item.binary.data }}`.

#### Template Source: Text Content

Provide the template as inline text (HTML or TXT with template variables). The content is base64-encoded before sending to the API. Use Binary Input for structured formats such as DOCX, XLSX, and PPTX.

**Example — HTML template with Carbone.js syntax:**

```html
<html>
  <body>
    <h1>Invoice for {d.firstName} {d.lastName}</h1>
    <p>Date: {d.invoiceDate}</p>
    <table>
      <tr>
        <th>Item</th>
        <th>Qty</th>
        <th>Price</th>
      </tr>
      {#d.items}
      <tr>
        <td>{d.description}</td>
        <td>{d.qty}</td>
        <td>{d.price}</td>
      </tr>
      {/d.items}
    </table>
  </body>
</html>
```

> **Note:** CDOGS uses [Carbone.js](https://carbone.io/) for template rendering. Template syntax follows Carbone conventions — use `{d.fieldName}` for variable substitution and `{#d.array}...{/d.array}` for loops.

### Custom Formatters (Both Generate Operations)

Enable **Custom Formatters**, then enter a TeleJSON formatter map. The node validates that the value is a JSON object and sends it as the `formatters` string expected by CDOGS. Formatter functions run in CDOGS, not in n8n; only use trusted formatter code.

```json
{
  "myFormatter": "_function_myFormatter|function(data) { return data.slice(1); }",
  "myOtherFormatter": "_function_myOtherFormatter|function(data) { return data.slice(2); }"
}
```

---

## Error Handling

The node supports n8n's **Continue On Fail** mode. When enabled:

- Failed items produce `{ "error": "error message" }` in the output instead of stopping the workflow
- Successfully processed items continue normally
- Each output item maintains proper item linking (`pairedItem`) for data tracing

Common error scenarios:

| Error                         | Cause                                                              |
| ----------------------------- | ------------------------------------------------------------------ |
| Invalid JSON in Template Data | The data field doesn't contain valid JSON                          |
| Template not found (404)      | The template hash doesn't exist or has expired                     |
| Authorization failed (401)    | OAuth2 token is invalid or expired                                 |
| Token issuer not allowed      | Network/environment mismatch (see [Credentials](./credentials.md)) |

---

## Output Format

### JSON operations (Health Check, Upload, Check, Remove)

Standard n8n JSON items:

```json
[{ "json": { "key": "value" } }]
```

### Binary operations (Generate from Existing, Generate from Inline)

Binary items with the rendered document:

```json
[{ "json": {}, "binary": { "data": { "fileName": "report.pdf", "mimeType": "application/pdf", "data": "..." } } }]
```

The binary field name is configurable via "Output Data Field Name" (default: `data`). Connect to a "Write Binary File" node or "Send Email" node to use the generated document.
