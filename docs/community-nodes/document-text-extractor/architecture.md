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

`shared/options.ts` validates runtime settings at the node boundary before binary access and again at the shared extractor entry point before provider work. The ranges and serialized selection values are listed in [Node operations](node-operations.md#runtime-enforced-limits).

`shared/lifecycle.ts` retains each shutdown promise, including rejection, and observes event-triggered shutdown immediately. Failed PDF requests and OCR recognition await any initiated shutdown before settling; repeated cleanup waits for the same exit. A replacement OCR worker cannot start until the previous shutdown succeeds, and late messages/errors/exits from an old worker are ignored. PDF cleanup is awaited for successful and failed documents, and final OCR cleanup is awaited before returning the batch.

Cleanup rejection stops the batch, including under Continue On Fail, because exit is unconfirmed. If extraction also failed, its message remains primary and the original error is retained as the cleanup error's cause. Shutdown time is additional to the processing deadline; the node deliberately waits rather than starting overlapping work.

The next-document boundary also awaits shutdown initiated while the reusable OCR worker was idle (for example, during PDF cleanup). A subsequent text-only PDF cannot bypass that wait: no next-item binary retrieval or provider work starts until the pending exit succeeds. Healthy OCR workers remain available for reuse.

The node limits files to 25 MB, decoded images and rendered PDF pages to 16 million pixels, output text to a configurable character count, and PDF processing to at most 100 configured pages. PDF pages are rendered and OCRed one at a time. OCR is intentionally sequential to avoid multiplying worker memory use within an n8n worker process.

## Binary Storage

The node reads data through n8n's `getBinaryDataBuffer()` helper, so it works with the deployment's S3-backed binary storage. It does not depend on local files shared between queue workers.

## Network Access

PDF processing is local. Tesseract.js may retrieve OCR language data on first use. Environments without outbound access must make the required trained-data files available through Tesseract's cache or adopt a separately hosted OCR service.

## Built-worker verification

From `community-nodes`, run `pnpm --config.auto-install=false build` followed by `pnpm --config.auto-install=false test tests/DocumentTextExtractor`. The required `pdfWorker.smoke.test.ts` loads the compiled extractor from `dist`, which launches the actual adjacent `pdfWorker.js`. It extracts a deterministic local PDF fixture from `tests/DocumentTextExtractor/fixtures/pdf.ts` in embedded-text mode, without OCR or language downloads. Missing build artifacts fail this test rather than skipping it. Deferred worker fakes separately verify timeout, replacement, late-event and cleanup-rejection boundaries.
