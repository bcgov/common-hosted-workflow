import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { createPdf } from './fixtures/pdf';

describe('built PDF worker smoke (run pnpm build first)', () => {
  it('loads the shipped extractor and actual pdfWorker.js and extracts the local PDF fixture', async () => {
    const require = createRequire(import.meta.url);
    const { extractDocumentText } =
      require('../../dist/nodes/DocumentTextExtractor/shared/extractor.js') as typeof import('../../nodes/DocumentTextExtractor/shared/extractor');
    const recognize = vi.fn(() => {
      throw new Error('Smoke test must not start OCR');
    });

    const result = await extractDocumentText(
      createPdf('Local built worker smoke'),
      'application/pdf',
      {
        mode: 'text',
        language: 'eng',
        pageSegmentationMode: 'auto',
        renderScale: 1,
        maxPages: 1,
        minimumTextLength: 0,
        pageSeparator: '\n',
        maxCharacters: 1000,
        documentTimeoutMs: 10000,
      },
      { recognize },
    );

    expect(result).toEqual({
      text: 'Local built worker smoke',
      method: 'pdfText',
      pages: [{ pageNumber: 1, text: 'Local built worker smoke', method: 'pdfText', confidence: null }],
      pageCount: 1,
      processedPageCount: 1,
      truncated: false,
      textTruncated: false,
    });
    expect(recognize).not.toHaveBeenCalled();
  }, 15000);
});
