import { EventEmitter } from 'node:events';
import type { Worker } from 'node:worker_threads';
import { describe, expect, it, vi } from 'vitest';
import { PdfEngine } from '../../nodes/DocumentTextExtractor/shared/pdfEngine';

class FakeWorker extends EventEmitter {
  postMessage = vi.fn();
  terminate = vi.fn().mockResolvedValue(1);
}

describe('PdfEngine', () => {
  it('passes PDF operations through an isolated worker', async () => {
    const worker = new FakeWorker();
    const engine = new PdfEngine(Buffer.from('pdf'), undefined, 1000, () => worker as unknown as Worker);
    const operation = engine.getText(3, 1000);

    worker.emit('message', { type: 'ready' });
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledOnce());
    const request = worker.postMessage.mock.calls[0][0] as { id: number };
    worker.emit('message', {
      type: 'result',
      id: request.id,
      result: { total: 1, pages: [{ pageNumber: 1, text: 'Hello' }] },
    });

    await expect(operation).resolves.toEqual({ total: 1, pages: [{ pageNumber: 1, text: 'Hello' }] });
    await engine.terminate();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates PDF processing when an operation times out', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const engine = new PdfEngine(Buffer.from('pdf'), undefined, 1000, () => worker as unknown as Worker);
    const operation = engine.renderPage(1, 2, 500);
    worker.emit('message', { type: 'ready' });
    await Promise.resolve();
    const rejection = expect(operation).rejects.toThrow('Rendering PDF page 1 timed out');

    await vi.advanceTimersByTimeAsync(500);

    await rejection;
    expect(worker.terminate).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
