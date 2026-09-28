import { describe, expect, it, vi } from 'vitest';
import { imageSize } from 'image-size';
import { PdfAdapter } from '../../nodes/DocumentTextExtractor/shared/pdfAdapter';
import {
  extractDocumentText,
  type ExtractionOptions,
  type OcrProvider,
} from '../../nodes/DocumentTextExtractor/shared/extractor';

import { createPdf } from './fixtures/pdf';

const options: ExtractionOptions = {
  mode: 'auto',
  language: 'eng',
  pageSegmentationMode: 'auto',
  renderScale: 1,
  maxPages: 20,
  minimumTextLength: 5,
  pageSeparator: '\n\n',
  maxCharacters: 1000000,
  documentTimeoutMs: 10000,
};

describe('PDF extraction integration', () => {
  it('extracts a real embedded PDF text layer without starting OCR', async () => {
    const ocr: OcrProvider = { recognize: vi.fn() };

    const result = await extractDocumentText(
      createPdf('Hello PDF'),
      'application/pdf',
      options,
      ocr,
      (buffer, password) => new PdfAdapter(buffer, password),
    );

    expect(result.text).toContain('Hello PDF');
    expect(result.method).toBe('pdfText');
    expect(ocr.recognize).not.toHaveBeenCalled();
  });

  it('renders a real blank PDF page to PNG before OCR fallback', async () => {
    const recognize = vi.fn(async (image: Buffer | Uint8Array) => {
      expect(imageSize(image).type).toBe('png');
      return { text: 'Rendered page', confidence: 90 };
    });

    const result = await extractDocumentText(
      createPdf(),
      'application/pdf',
      options,
      { recognize },
      (buffer, password) => new PdfAdapter(buffer, password),
    );

    expect(result.text).toBe('Rendered page');
    expect(result.method).toBe('ocr');
    expect(recognize).toHaveBeenCalledOnce();
  });
});
