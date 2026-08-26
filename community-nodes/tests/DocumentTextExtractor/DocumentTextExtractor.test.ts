import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getInfo: vi.fn(),
  renderPage: vi.fn(),
  getText: vi.fn(),
  destroyParser: vi.fn(),
  pdfConstructor: vi.fn(),
  recognize: vi.fn(),
  terminateOcr: vi.fn(),
}));

vi.mock('../../nodes/DocumentTextExtractor/shared/ocrEngine', () => ({
  OcrEngine: class OcrEngine {
    recognize = mocks.recognize;
    terminate = mocks.terminateOcr;
  },
}));

vi.mock('../../nodes/DocumentTextExtractor/shared/pdfEngine', () => ({
  PdfEngine: class PdfEngine {
    constructor(...args: unknown[]) {
      mocks.pdfConstructor(...args);
    }

    getInfo = mocks.getInfo;
    inspect = mocks.getInfo;
    renderPage = mocks.renderPage;
    getText = mocks.getText;
    terminate = mocks.destroyParser;
  },
}));

import { DocumentTextExtractor } from '../../nodes/DocumentTextExtractor/DocumentTextExtractor.node';
import {
  extractDocumentText,
  type ExtractionOptions,
  type OcrProvider,
} from '../../nodes/DocumentTextExtractor/shared/extractor';

const defaultOptions: ExtractionOptions = {
  mode: 'auto',
  language: 'eng',
  pageSegmentationMode: 'auto',
  renderScale: 2,
  maxPages: 20,
  minimumTextLength: 20,
  pageSeparator: '\n\n',
  maxCharacters: 1000000,
  documentTimeoutMs: 120000,
};

function validPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
}

function mockOcr(results: Array<{ text: string; confidence: number }>): OcrProvider {
  const recognize = vi.fn();
  for (const result of results) recognize.mockResolvedValueOnce(result);
  return { recognize };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.destroyParser.mockResolvedValue(undefined);
  mocks.terminateOcr.mockResolvedValue(undefined);
});

describe('document extraction', () => {
  it('extracts text from an image and terminates its OCR worker', async () => {
    const ocr = mockOcr([{ text: 'Recognized image', confidence: 96 }]);

    const result = await extractDocumentText(validPng(), 'image/png', defaultOptions, ocr);

    expect(result).toMatchObject({
      text: 'Recognized image',
      method: 'ocr',
      pageCount: 1,
      pages: [{ pageNumber: 1, confidence: 96, method: 'ocr' }],
    });
    expect(ocr.recognize).toHaveBeenCalledOnce();
  });

  it('uses native PDF text and OCR fallback on a per-page basis', async () => {
    mocks.getText.mockResolvedValue({
      total: 2,
      pages: [
        { pageNumber: 1, text: 'This page has a usable embedded text layer.' },
        { pageNumber: 2, text: '' },
      ],
    });
    mocks.renderPage.mockResolvedValue(new Uint8Array([1, 2]));
    mocks.getInfo.mockResolvedValue({
      total: 2,
      pages: [{ pageNumber: 2, width: 612, height: 792, links: [] }],
    });
    const ocr = mockOcr([{ text: 'Scanned second page', confidence: 91 }]);

    const result = await extractDocumentText(Buffer.from('%PDF-example'), 'application/pdf', defaultOptions, ocr);

    expect(mocks.renderPage).toHaveBeenCalledWith(2, 2, expect.any(Number));
    expect(result.method).toBe('mixed');
    expect(result.pages).toEqual([
      expect.objectContaining({ pageNumber: 1, method: 'pdfText' }),
      expect.objectContaining({ pageNumber: 2, method: 'ocr', text: 'Scanned second page' }),
    ]);
    expect(mocks.destroyParser).toHaveBeenCalledOnce();
  });

  it('rejects unsupported binary types', async () => {
    await expect(
      extractDocumentText(Buffer.from('data'), 'application/zip', defaultOptions, mockOcr([])),
    ).rejects.toThrow('Provide a PDF or image file');
    expect(mocks.recognize).not.toHaveBeenCalled();
  });

  it('rejects corrupt data labeled as an image before OCR', async () => {
    const ocr = mockOcr([]);

    await expect(extractDocumentText(Buffer.from('not an image'), 'image/png', defaultOptions, ocr)).rejects.toThrow();
    expect(ocr.recognize).not.toHaveBeenCalled();
  });

  it('rejects a PDF page before rendering when its scaled dimensions are too large', async () => {
    mocks.getText.mockResolvedValue({ total: 1, pages: [{ pageNumber: 1, text: '' }] });
    mocks.getInfo.mockResolvedValue({
      total: 1,
      pages: [{ pageNumber: 1, width: 5000, height: 5000, links: [] }],
    });

    await expect(
      extractDocumentText(Buffer.from('%PDF-example'), 'application/pdf', defaultOptions, mockOcr([])),
    ).rejects.toThrow('rendered-pixel limit');
    expect(mocks.renderPage).not.toHaveBeenCalled();
    expect(mocks.destroyParser).toHaveBeenCalledOnce();
  });

  it('bounds OCR output text', async () => {
    const result = await extractDocumentText(
      validPng(),
      'image/png',
      { ...defaultOptions, maxCharacters: 5 },
      mockOcr([{ text: '123456789', confidence: 90 }]),
    );

    expect(result.text).toBe('12345');
    expect(result.pages[0].text).toBe('12345');
    expect(result.textTruncated).toBe(true);
  });
});

describe('DocumentTextExtractor node', () => {
  it('preserves JSON, pairs output, and optionally preserves binary data', async () => {
    mocks.recognize.mockResolvedValue({ text: 'Node result', confidence: 88 });
    const binary = {
      data: Buffer.from('image').toString('base64'),
      mimeType: 'image/png',
      fileName: 'scan.png',
    };
    const params: Record<string, unknown> = {
      binaryPropertyName: 'data',
      keepBinary: true,
      mode: 'auto',
      language: 'eng',
      pageSegmentationMode: 'auto',
      renderScale: 2,
      maxPages: 20,
      minimumTextLength: 20,
      pageSeparator: '\n\n',
      maxCharacters: 1000000,
      documentTimeoutMs: 120000,
      destinationField: 'documentText',
      password: '',
    };
    const context = {
      getInputData: vi.fn(() => [{ json: { requestId: 'abc' }, binary: { data: binary } }]),
      getNodeParameter: vi.fn((name: string) => params[name]),
      getNode: vi.fn(() => ({ name: 'Document Text Extractor Test', type: 'test', typeVersion: 1 })),
      continueOnFail: vi.fn(() => false),
      helpers: {
        assertBinaryData: vi.fn(() => binary),
        getBinaryDataBuffer: vi.fn().mockResolvedValue(validPng()),
      },
    };

    const result = await new DocumentTextExtractor().execute.call(context as never);

    expect(result[0][0]).toMatchObject({
      json: {
        requestId: 'abc',
        documentText: {
          text: 'Node result',
          method: 'ocr',
          sourceFileName: 'scan.png',
        },
      },
      binary: { data: binary },
      pairedItem: { item: 0 },
    });
    expect(mocks.terminateOcr).toHaveBeenCalledOnce();
  });

  it('returns an item error when continueOnFail is enabled', async () => {
    const params: Record<string, unknown> = {
      binaryPropertyName: 'data',
      keepBinary: false,
      mode: 'auto',
      language: 'eng',
      pageSegmentationMode: 'auto',
      renderScale: 2,
      maxPages: 20,
      minimumTextLength: 20,
      pageSeparator: '\n\n',
      maxCharacters: 1000000,
      documentTimeoutMs: 120000,
      destinationField: 'documentText',
      password: '',
    };
    const context = {
      getInputData: vi.fn(() => [{ json: { requestId: 'bad' } }]),
      getNodeParameter: vi.fn((name: string) => params[name]),
      getNode: vi.fn(() => ({ name: 'Document Text Extractor Test', type: 'test', typeVersion: 1 })),
      continueOnFail: vi.fn(() => true),
      helpers: {
        assertBinaryData: vi.fn(() => {
          throw new Error('Binary field data is missing');
        }),
        getBinaryDataBuffer: vi.fn(),
      },
    };

    const result = await new DocumentTextExtractor().execute.call(context as never);

    expect(result).toEqual([
      [
        {
          json: { requestId: 'bad', error: 'Binary field data is missing' },
          pairedItem: { item: 0 },
        },
      ],
    ]);
  });

  it('preserves binary data on failed items when requested', async () => {
    const binary = { data: 'invalid', mimeType: 'application/zip' };
    const params: Record<string, unknown> = {
      binaryPropertyName: 'data',
      keepBinary: true,
      mode: 'auto',
      language: 'eng',
      pageSegmentationMode: 'auto',
      renderScale: 2,
      maxPages: 20,
      minimumTextLength: 20,
      pageSeparator: '\n\n',
      maxCharacters: 1000000,
      documentTimeoutMs: 120000,
      destinationField: 'documentText',
      password: '',
    };
    const context = {
      getInputData: vi.fn(() => [{ json: {}, binary: { data: binary } }]),
      getNodeParameter: vi.fn((name: string) => params[name]),
      getNode: vi.fn(() => ({ name: 'Document Text Extractor Test', type: 'test', typeVersion: 1 })),
      continueOnFail: vi.fn(() => true),
      helpers: {
        assertBinaryData: vi.fn(() => binary),
        getBinaryDataBuffer: vi.fn().mockResolvedValue(Buffer.from('invalid')),
      },
    };

    const result = await new DocumentTextExtractor().execute.call(context as never);

    expect(result[0][0].binary).toEqual({ data: binary });
  });

  it('normalizes non-Error failures when continueOnFail is enabled', async () => {
    mocks.recognize.mockRejectedValue('worker rejected');
    const params: Record<string, unknown> = {
      binaryPropertyName: 'data',
      keepBinary: false,
      mode: 'auto',
      language: 'eng',
      pageSegmentationMode: 'auto',
      renderScale: 2,
      maxPages: 20,
      minimumTextLength: 20,
      pageSeparator: '\n\n',
      maxCharacters: 1000000,
      documentTimeoutMs: 120000,
      destinationField: 'documentText',
      password: '',
    };
    const context = {
      getInputData: vi.fn(() => [{ json: {} }]),
      getNodeParameter: vi.fn((name: string) => params[name]),
      getNode: vi.fn(() => ({ name: 'Document Text Extractor Test', type: 'test', typeVersion: 1 })),
      continueOnFail: vi.fn(() => true),
      helpers: {
        assertBinaryData: vi.fn(() => ({ mimeType: 'image/png' })),
        getBinaryDataBuffer: vi.fn().mockResolvedValue(validPng()),
      },
    };

    const result = await new DocumentTextExtractor().execute.call(context as never);

    expect(result[0][0].json.error).toBe('worker rejected');
  });

  it('evaluates PDF passwords and output fields for each input item', async () => {
    mocks.getText
      .mockResolvedValueOnce({ total: 1, pages: [{ pageNumber: 1, text: 'First' }] })
      .mockResolvedValueOnce({ total: 1, pages: [{ pageNumber: 1, text: 'Second' }] });
    const params: Record<string, unknown> = {
      binaryPropertyName: 'data',
      keepBinary: false,
      mode: 'text',
      language: 'eng',
      pageSegmentationMode: 'auto',
      renderScale: 2,
      maxPages: 20,
      minimumTextLength: 20,
      pageSeparator: '\n\n',
      maxCharacters: 1000000,
      documentTimeoutMs: 120000,
    };
    const context = {
      getInputData: vi.fn(() => [
        { json: { id: 1 }, binary: { data: { mimeType: 'application/pdf' } } },
        { json: { id: 2 }, binary: { data: { mimeType: 'application/pdf' } } },
      ]),
      getNodeParameter: vi.fn((name: string, itemIndex: number) => {
        if (name === 'password') return itemIndex === 0 ? 'first-password' : 'second-password';
        if (name === 'destinationField') return itemIndex === 0 ? 'firstResult' : 'secondResult';
        return params[name];
      }),
      getNode: vi.fn(() => ({ name: 'Document Text Extractor Test', type: 'test', typeVersion: 1 })),
      continueOnFail: vi.fn(() => false),
      helpers: {
        assertBinaryData: vi.fn((itemIndex: number) => ({
          mimeType: 'application/pdf',
          fileName: `${itemIndex}.pdf`,
        })),
        getBinaryDataBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF-example')),
      },
    };

    const result = await new DocumentTextExtractor().execute.call(context as never);

    expect(mocks.pdfConstructor.mock.calls[0][1]).toBe('first-password');
    expect(mocks.pdfConstructor.mock.calls[1][1]).toBe('second-password');
    expect(result[0][0].json).toHaveProperty('firstResult.text', 'First');
    expect(result[0][1].json).toHaveProperty('secondResult.text', 'Second');
  });
});
