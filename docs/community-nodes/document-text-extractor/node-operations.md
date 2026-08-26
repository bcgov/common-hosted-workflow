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

## PDF Modes

### Automatic

Extracts embedded text from each page. Pages below **Minimum Embedded Text Length** are rendered as PNG images and passed through OCR. This is the recommended mode for unknown or mixed PDFs.

### Embedded Text Only

Extracts the PDF text layer without initializing OCR. Scanned pages generally return empty text.

### OCR All Pages

Renders every selected page and processes it with OCR. Use this when the PDF text layer is absent, corrupt, or has an unusable reading order.

## Errors

Unsupported file types, missing binary fields, oversized files or rendered pages, invalid PDFs, encrypted PDFs without the correct password, timeouts, PDF rendering failures, and OCR initialization failures produce node operation errors. With n8n's **Continue On Fail** setting enabled, the failed input produces an error item and subsequent inputs continue.
