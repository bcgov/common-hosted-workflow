import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Worker } from 'node:worker_threads';

const mocks = vi.hoisted(() => ({
  pdfConstructor: vi.fn(),
  ocrConstructor: vi.fn(),
  getText: vi.fn(),
  terminatePdf: vi.fn(),
  terminateOcr: vi.fn(),
  recognize: vi.fn(),
  waitForShutdown: vi.fn(),
}));
vi.mock('../../nodes/DocumentTextExtractor/shared/ocrEngine', () => ({
  OcrEngine: class {
    constructor() {
      mocks.ocrConstructor();
    }
    recognize = mocks.recognize;
    terminate = mocks.terminateOcr;
    waitForShutdown = mocks.waitForShutdown;
  },
}));
vi.mock('../../nodes/DocumentTextExtractor/shared/pdfEngine', () => ({
  PdfEngine: class {
    constructor() {
      mocks.pdfConstructor();
    }
    getText = mocks.getText;
    terminate = mocks.terminatePdf;
  },
}));

import { DocumentTextExtractor } from '../../nodes/DocumentTextExtractor/DocumentTextExtractor.node';
import { extractDocumentText, type ExtractionOptions } from '../../nodes/DocumentTextExtractor/shared/extractor';
import { validateExtractionOptions } from '../../nodes/DocumentTextExtractor/shared/options';
import { WorkerCleanupError } from '../../nodes/DocumentTextExtractor/shared/lifecycle';

const options: ExtractionOptions = {
  mode: 'text',
  language: 'eng',
  pageSegmentationMode: 'auto',
  renderScale: 2,
  maxPages: 20,
  minimumTextLength: 20,
  pageSeparator: '\n',
  maxCharacters: 1000,
  documentTimeoutMs: 1000,
};

function context(overrides: Record<string, unknown> = {}, count = 1, continueOnFail = true) {
  const parameters: Record<string, unknown> = {
    ...options,
    binaryPropertyName: 'data',
    destinationField: 'documentText',
    keepBinary: false,
    ...overrides,
  };
  return {
    getInputData: () => Array.from({ length: count }, (_, id) => ({ json: { id } })),
    getNode: () => ({ name: 'Document Text Extractor', type: 'test', typeVersion: 1 }),
    getNodeParameter: vi.fn((name: string, index: number, fallback?: unknown) => {
      if (!(name in parameters)) {
        if (fallback !== undefined) return fallback;
        throw new Error(`Missing parameter: ${name}`);
      }
      const value = parameters[name];
      return typeof value === 'function' ? value(index) : value;
    }),
    continueOnFail: () => continueOnFail,
    helpers: {
      assertBinaryData: vi.fn(() => ({ mimeType: 'application/pdf' })),
      getBinaryDataBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF-local')),
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getText.mockResolvedValue({ total: 1, pages: [{ pageNumber: 1, text: 'Success' }] });
  mocks.terminatePdf.mockResolvedValue(undefined);
  mocks.terminateOcr.mockResolvedValue(undefined);
  mocks.waitForShutdown.mockResolvedValue(undefined);
});

const bounds = [
  ['maxPages', 1, 100, true],
  ['renderScale', 1, 4, false],
  ['minimumTextLength', 0, 10000, true],
  ['maxCharacters', 1000, 10000000, true],
  ['documentTimeoutMs', 1000, 300000, true],
] as const;
const invalidOptions: Array<[string, unknown]> = bounds.flatMap(([name, min, max, integer]) =>
  [
    min - 1,
    max + 1,
    -1,
    'nonnumeric',
    String(min),
    null,
    undefined,
    NaN,
    Infinity,
    -Infinity,
    true,
    {},
    ...(integer ? [min + 0.5] : []),
  ].map((value): [string, unknown] => [name, value]),
);
for (const name of ['mode', 'pageSegmentationMode']) {
  for (const value of ['invalid', '', 'AUTO', 0, null, undefined, {}, ['auto']]) invalidOptions.push([name, value]);
}

describe('runtime option validation', () => {
  it.each(invalidOptions)('rejects %s=%s before binary or provider work at both entry points', async (name, value) => {
    const ctx = context({ [name]: value });
    const [items] = await new DocumentTextExtractor().execute.call(ctx as never);
    expect(items[0]).toMatchObject({ json: { id: 0, error: expect.stringContaining(name) }, pairedItem: { item: 0 } });
    expect(ctx.helpers.assertBinaryData).not.toHaveBeenCalled();
    expect(ctx.helpers.getBinaryDataBuffer).not.toHaveBeenCalled();
    await expect(
      extractDocumentText(
        Buffer.from('%PDF'),
        'application/pdf',
        { ...options, [name]: value },
        { recognize: mocks.recognize },
      ),
    ).rejects.toThrow(name);
    expect(mocks.pdfConstructor).not.toHaveBeenCalled();
    expect(mocks.ocrConstructor).not.toHaveBeenCalled();
    expect(mocks.recognize).not.toHaveBeenCalled();
  });

  it.each(
    bounds.flatMap(([name, min, max]) => [
      [name, min],
      [name, max],
    ]),
  )('accepts the inclusive %s boundary %s in a real node execution', async (name, value) => {
    const ctx = context({ [name]: value });
    const [items] = await new DocumentTextExtractor().execute.call(ctx as never);
    expect(items[0].json).toHaveProperty('documentText.text', 'Success');
    expect(mocks.getText).toHaveBeenCalledOnce();
  });

  it.each([1.1, 2.5, 3.999])('accepts finite fractional renderScale=%s', (renderScale) => {
    expect(() => validateExtractionOptions({ ...options, renderScale })).not.toThrow();
  });
  it.each(['auto', 'text', 'ocr'] as const)('accepts mode=%s', (mode) => {
    expect(() => validateExtractionOptions({ ...options, mode })).not.toThrow();
  });
  it.each(['auto', 'singleBlock', 'singleColumn', 'sparseText'] as const)(
    'accepts segmentation=%s',
    (pageSegmentationMode) => {
      expect(() => validateExtractionOptions({ ...options, pageSegmentationMode })).not.toThrow();
    },
  );

  it('recovers after invalid per-item options, with paired errors and success', async () => {
    const ctx = context({ maxPages: (index: number) => (index === 0 ? 1.5 : 1) }, 2);
    const [items] = await new DocumentTextExtractor().execute.call(ctx as never);
    expect(items[0]).toMatchObject({
      json: { id: 0, error: expect.stringContaining('maxPages') },
      pairedItem: { item: 0 },
    });
    expect(items[1]).toMatchObject({ json: { id: 1, documentText: { text: 'Success' } }, pairedItem: { item: 1 } });
    expect(ctx.helpers.getBinaryDataBuffer).toHaveBeenCalledExactlyOnceWith(1, 'data');
    expect(mocks.pdfConstructor).toHaveBeenCalledOnce();
    for (const name of ['mode', 'language', 'pageSegmentationMode', 'documentTimeoutMs']) {
      expect(ctx.getNodeParameter.mock.calls.filter(([key]) => key === name).every(([, index]) => index === 0)).toBe(
        true,
      );
    }
  });

  it('stops before retrieval when invalid options occur without Continue On Fail', async () => {
    const ctx = context({ maxCharacters: 999 }, 2, false);
    await expect(new DocumentTextExtractor().execute.call(ctx as never)).rejects.toThrow('maxCharacters');
    expect(ctx.helpers.getBinaryDataBuffer).not.toHaveBeenCalled();
  });
});

describe('document cleanup boundaries', () => {
  it.each([false, true])('awaits idle OCR shutdown before the next document (rejection=%s)', async (rejectExit) => {
    const { OcrEngine } = await vi.importActual<typeof import('../../nodes/DocumentTextExtractor/shared/ocrEngine')>(
      '../../nodes/DocumentTextExtractor/shared/ocrEngine',
    );
    let finishExit!: () => void;
    let rejectShutdown!: (error: Error) => void;
    let finishPdf!: () => void;
    const worker = Object.assign(new EventEmitter(), {
      postMessage: vi.fn(),
      terminate: vi.fn(
        () =>
          new Promise<number>((resolve, reject) => {
            finishExit = () => resolve(1);
            rejectShutdown = reject;
          }),
      ),
    });
    const engine = new OcrEngine('eng', 'auto', 1000, () => worker as unknown as Worker);
    mocks.recognize.mockImplementation((image: Buffer) => engine.recognize(image));
    mocks.terminateOcr.mockImplementation(() => engine.terminate());
    mocks.waitForShutdown.mockImplementation(() => engine.waitForShutdown());
    mocks.terminatePdf.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishPdf = resolve;
        }),
    );
    const ctx = context({}, 3);
    ctx.helpers.assertBinaryData.mockReturnValueOnce({ mimeType: 'image/png' });
    ctx.helpers.getBinaryDataBuffer.mockResolvedValueOnce(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const outcome = vi.fn();
    const execution = new DocumentTextExtractor().execute.call(ctx as never).then(
      (result) => {
        outcome(result);
        return result;
      },
      (error: Error) => {
        outcome(error);
        throw error;
      },
    );
    // Attach a rejection handler immediately; assertions below still inspect the original promise.
    void execution.catch(() => undefined);
    await vi.waitFor(() => expect(mocks.recognize).toHaveBeenCalledOnce());
    worker.emit('message', { type: 'ready' });
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledOnce());
    const { id } = worker.postMessage.mock.calls[0][0];
    worker.emit('message', { type: 'result', id, text: 'OCR success', confidence: 99 });
    await vi.waitFor(() => expect(mocks.terminatePdf).toHaveBeenCalledOnce());
    worker.emit('error', new Error('idle OCR failure'));
    await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalledOnce());
    finishPdf();
    // Give the item loop a turn while OCR shutdown remains deliberately unresolved.
    await new Promise<void>((resolve) => setImmediate(resolve));
    const retrievedBeforeExit = ctx.helpers.getBinaryDataBuffer.mock.calls.length;
    const providersBeforeExit = mocks.pdfConstructor.mock.calls.length;
    expect(outcome).not.toHaveBeenCalled();
    if (rejectExit) {
      rejectShutdown(new Error('idle OCR exit rejected'));
      await expect(execution).rejects.toThrow('idle OCR exit rejected');
      expect(ctx.helpers.getBinaryDataBuffer).toHaveBeenCalledTimes(2);
    } else {
      finishExit();
      const [items] = await execution;
      expect(items).toHaveLength(3);
      expect(items[2]).toMatchObject({ json: { documentText: { text: 'Success' } }, pairedItem: { item: 2 } });
    }
    expect(retrievedBeforeExit).toBe(2);
    expect(providersBeforeExit).toBe(1);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    'awaits actual OCR engine timeout shutdown before the next document (rejection=%s)',
    async (rejectExit) => {
      const { OcrEngine } = await vi.importActual<typeof import('../../nodes/DocumentTextExtractor/shared/ocrEngine')>(
        '../../nodes/DocumentTextExtractor/shared/ocrEngine',
      );
      let finish!: () => void;
      let reject!: (error: Error) => void;
      const worker = Object.assign(new EventEmitter(), {
        postMessage: vi.fn(),
        terminate: vi.fn(
          () =>
            new Promise<number>((resolve, no) => {
              finish = () => resolve(1);
              reject = no;
            }),
        ),
      });
      const engine = new OcrEngine('eng', 'auto', 1000, () => worker as unknown as Worker);
      mocks.recognize
        .mockImplementationOnce((image: Buffer) => engine.recognize(image, 10))
        .mockResolvedValueOnce({ text: 'Recovered', confidence: 99 });
      mocks.terminateOcr.mockImplementation(() => engine.terminate());
      const ctx = context({}, 2);
      ctx.helpers.assertBinaryData.mockReturnValue({ mimeType: 'image/png' });
      ctx.helpers.getBinaryDataBuffer.mockResolvedValue(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      );
      const execution = new DocumentTextExtractor().execute.call(ctx as never);
      // No ready event: exercise a real initialization timeout through the node boundary.
      await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalledOnce());
      expect(ctx.helpers.getBinaryDataBuffer).toHaveBeenCalledTimes(1);
      expect(mocks.recognize).toHaveBeenCalledTimes(1);
      if (rejectExit) {
        reject(new Error('OCR exit rejected'));
        await expect(execution).rejects.toThrow('initialization timed out');
        await expect(execution).rejects.toThrow('OCR exit rejected');
        expect(ctx.helpers.getBinaryDataBuffer).toHaveBeenCalledTimes(1);
      } else {
        finish();
        const [items] = await execution;
        expect(items[0]).toMatchObject({
          json: { error: expect.stringContaining('initialization timed out') },
          pairedItem: { item: 0 },
        });
        expect(items[1]).toMatchObject({ json: { documentText: { text: 'Recovered' } }, pairedItem: { item: 1 } });
      }
      expect(worker.terminate).toHaveBeenCalledOnce();
    },
  );

  it.each([false, true])('awaits PDF cleanup before retrieving the next item (extraction failure=%s)', async (fail) => {
    let finish!: () => void;
    mocks.terminatePdf.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    if (fail) mocks.getText.mockRejectedValueOnce(new Error('first failed'));
    const ctx = context({}, 2);
    const execution = new DocumentTextExtractor().execute.call(ctx as never);
    await vi.waitFor(() => expect(mocks.terminatePdf).toHaveBeenCalledOnce());
    expect(ctx.helpers.getBinaryDataBuffer).toHaveBeenCalledTimes(1);
    expect(mocks.pdfConstructor).toHaveBeenCalledTimes(1);
    finish();
    const [items] = await execution;
    expect(items[0].json).toHaveProperty(fail ? 'error' : 'documentText.text', fail ? 'first failed' : 'Success');
    expect(items[1]).toMatchObject({ json: { documentText: { text: 'Success' } }, pairedItem: { item: 1 } });
  });

  it.each([false, true])(
    'stops the batch on PDF cleanup rejection and preserves extraction failure=%s',
    async (fail) => {
      if (fail) mocks.getText.mockRejectedValueOnce(new Error('original extraction failure'));
      mocks.terminatePdf.mockRejectedValueOnce(new Error('shutdown rejected'));
      const ctx = context({}, 2);
      const execution = new DocumentTextExtractor().execute.call(ctx as never);
      await expect(execution).rejects.toThrow(fail ? 'original extraction failure' : 'Worker cleanup failed');
      await expect(execution).rejects.toThrow('shutdown rejected');
      expect(ctx.helpers.getBinaryDataBuffer).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves the original extraction error as cause when provider cleanup also fails', async () => {
    const original = new Error('original extraction failure');
    const cleanup = new Error('cleanup failure');
    mocks.getText.mockRejectedValue(original);
    mocks.terminatePdf.mockRejectedValue(cleanup);
    const extraction = extractDocumentText(Buffer.from('%PDF'), 'application/pdf', options, {
      recognize: mocks.recognize,
    });
    await expect(extraction).rejects.toBeInstanceOf(WorkerCleanupError);
    await expect(extraction).rejects.toMatchObject({ cause: original, cleanupError: cleanup });
    await expect(new DocumentTextExtractor().execute.call(context() as never)).rejects.toMatchObject({
      cause: { cause: original, cleanupError: cleanup },
    });
  });

  it('awaits final OCR cleanup before returning success', async () => {
    let finish!: () => void;
    mocks.terminateOcr.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const settled = vi.fn();
    const execution = new DocumentTextExtractor().execute.call(context() as never).then(settled);
    await vi.waitFor(() => expect(mocks.terminateOcr).toHaveBeenCalledOnce());
    expect(settled).not.toHaveBeenCalled();
    finish();
    await execution;
    expect(settled).toHaveBeenCalledOnce();
  });

  it('reports final OCR cleanup rejection alongside the original item error', async () => {
    mocks.getText.mockRejectedValue(new Error('original failure'));
    mocks.terminateOcr.mockRejectedValue(new Error('OCR shutdown rejected'));
    const execution = new DocumentTextExtractor().execute.call(context({}, 1, false) as never);
    await expect(execution).rejects.toThrow('original failure');
    await expect(execution).rejects.toThrow('OCR shutdown rejected');
  });

  it('reports final OCR cleanup rejection after otherwise successful extraction', async () => {
    mocks.terminateOcr.mockRejectedValue(new Error('OCR shutdown rejected'));
    await expect(new DocumentTextExtractor().execute.call(context() as never)).rejects.toThrow(
      'Worker cleanup failed: OCR shutdown rejected',
    );
  });
});
