# Architecture

## Processing Flow

```text
n8n binary input
       |
       +-- image --------------------------> Tesseract OCR
       |
       +-- PDF --> embedded text per page
                       |
                       +-- sufficient text -> preserve text
                       |
                       +-- insufficient text -> render page -> Tesseract OCR
```

PDF pages are rendered rather than extracting embedded image objects. This preserves page composition, rotation, vector content, and image placement before OCR.

## Resource Management

PDF parsing and rendering run in an isolated Node.js worker thread. Each document owns its PDF worker, and a timeout terminates that worker so parsing cannot continue in the n8n execution thread.

One Tesseract worker is created lazily in a separate isolated worker thread and reused sequentially during a node execution. A malformed image or stalled language download therefore cannot throw through n8n's process-level event loop. Initialization and recognition have hard timeouts that terminate the isolated thread.

The node limits files to 25 MB, decoded images and rendered PDF pages to 16 million pixels, output text to a configurable character count, and PDF processing to at most 100 configured pages. PDF pages are rendered and OCRed one at a time. OCR is intentionally sequential to avoid multiplying worker memory use within an n8n worker process.

## Binary Storage

The node reads data through n8n's `getBinaryDataBuffer()` helper, so it works with the deployment's S3-backed binary storage. It does not depend on local files shared between queue workers.

## Network Access

PDF processing is local. Tesseract.js may retrieve OCR language data on first use. Environments without outbound access must make the required trained-data files available through Tesseract's cache or adopt a separately hosted OCR service.
