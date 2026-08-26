# Document Text Extractor

The Document Text Extractor node extracts embedded text from PDFs and performs local OCR on scanned PDF pages and image files. It uses `pdf-parse` for PDF text extraction and page rendering, and Tesseract.js for OCR.

## Quick Start

1. Provide a PDF or image in an n8n binary field, normally `data`.
2. Add the **Document Text Extractor** node.
3. Select **Automatic** for mixed digital and scanned PDFs.
4. Read the result from `documentText` (or the configured destination field).

Images always use OCR. In Automatic mode, each PDF page with fewer than the configured minimum non-whitespace characters is rendered and OCRed; pages with usable embedded text are not OCRed.

## Supported Inputs

- PDF, including password-protected PDFs
- Image MIME types supported by Tesseract.js, including common PNG, JPEG, BMP, and WebP inputs
- Maximum input size: 25 MB
- Maximum configurable PDF page count: 100

OCR language data may be downloaded by Tesseract.js when a language is first used, so workers require outbound access unless language data is already cached.

## Output

```json
{
  "documentText": {
    "text": "Combined document text",
    "method": "mixed",
    "pages": [
      {
        "pageNumber": 1,
        "text": "Embedded text",
        "method": "pdfText",
        "confidence": null
      },
      {
        "pageNumber": 2,
        "text": "OCR text",
        "method": "ocr",
        "confidence": 93
      }
    ],
    "pageCount": 2,
    "processedPageCount": 2,
    "truncated": false,
    "textTruncated": false,
    "sourceFileName": "document.pdf",
    "sourceMimeType": "application/pdf"
  }
}
```

Existing input JSON fields are preserved outside the configurable destination field. The source binary is omitted by default and can be retained with **Keep Input Binary**.

## More Information

- [Architecture](architecture.md)
- [Node operations](node-operations.md)
