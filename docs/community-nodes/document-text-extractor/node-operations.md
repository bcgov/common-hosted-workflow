# Node Operations

## Parameters

| Parameter                    | Default        | Description                                                            |
| ---------------------------- | -------------- | ---------------------------------------------------------------------- |
| Input Binary Field           | `data`         | Binary property containing the PDF or image                            |
| PDF Extraction Mode          | Automatic      | Selects embedded text, OCR, or per-page automatic fallback             |
| OCR Language                 | `eng`          | Tesseract language code; combine languages with `+`                    |
| Page Segmentation            | Automatic      | Tesseract's assumption about the page layout                           |
| Maximum PDF Pages            | `20`           | Limits processing; accepted range is 1 through 100                     |
| PDF Render Scale             | `2`            | Raster scale for PDF OCR; accepted range is 1 through 4                |
| Minimum Embedded Text Length | `20`           | Non-whitespace characters needed to avoid OCR in Automatic mode        |
| PDF Password                 | Empty          | Password used to open an encrypted PDF                                 |
| Page Separator               | Two newlines   | Joins page text in the combined `text` field                           |
| Maximum Output Characters    | `1000000`      | Truncates extracted output beyond the configured limit                 |
| Document Timeout             | `120000`       | Limits total PDF and OCR processing time for each document             |
| Destination Field            | `documentText` | Contains all extraction output without overwriting common input fields |
| Keep Input Binary            | `false`        | Preserves the source binary on the output item                         |

### Runtime-enforced limits

These bounds are inclusive and enforced before binary retrieval and provider creation, including expression results and imported workflow settings. Values are rejected, never clamped or rounded; errors identify the serialized parameter name.

| Parameter              | Accepted value                                         |
| ---------------------- | ------------------------------------------------------ |
| `maxPages`             | Integer 1–100                                          |
| `renderScale`          | Finite number 1–4; fractions are supported             |
| `minimumTextLength`    | Integer 0–10,000                                       |
| `maxCharacters`        | Integer 1,000–10,000,000                               |
| `documentTimeoutMs`    | Integer 1,000–300,000 milliseconds                     |
| `mode`                 | `auto`, `text`, or `ocr`                               |
| `pageSegmentationMode` | `auto`, `singleBlock`, `singleColumn`, or `sparseText` |

Numeric strings, nonnumeric values, NaN and Infinity are rejected. All limits are validated even when the selected mode or file type does not use a setting. Mode, OCR language, segmentation and timeout remain execution-wide settings; expression-enabled limits are evaluated for each item. The page separator remains limited to 1,000 characters.

The processing timeout includes worker initialization. Worker shutdown is awaited afterward, so total wall-clock time can exceed the processing timeout while the worker exits.

## PDF Modes

### Automatic

Extracts embedded text from each page. Pages below **Minimum Embedded Text Length** are rendered as PNG images and passed through OCR. This is the recommended mode for unknown or mixed PDFs.

### Embedded Text Only

Extracts the PDF text layer without initializing OCR. Scanned pages generally return empty text.

### OCR All Pages

Renders every selected page and processes it with OCR. Use this when the PDF text layer is absent, corrupt, or has an unusable reading order.

## Errors

Invalid settings, unsupported file types, missing binary fields, oversized files or rendered pages, invalid PDFs, encrypted PDFs without the correct password, timeouts, PDF rendering failures, and OCR initialization failures produce errors. With n8n's **Continue On Fail** setting enabled, the failed input produces an error item paired to its input and subsequent inputs continue after required worker shutdown completes. An invalid per-item limit does not retrieve that item's binary and does not prevent a later item with valid limits from succeeding.

If worker shutdown itself rejects, execution stops even with **Continue On Fail**: worker exit is unconfirmed, so starting another document could overlap resource use. Cleanup errors are reported alongside the original extraction error when both occur. Successful results are returned only after final OCR cleanup succeeds.
