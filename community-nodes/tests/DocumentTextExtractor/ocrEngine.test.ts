import { EventEmitter } from 'node:events';
import type { Worker } from 'node:worker_threads';
import { describe, expect, it, vi } from 'vitest';
import { OcrEngine } from '../../nodes/DocumentTextExtractor/shared/ocrEngine';

class FakeWorker extends EventEmitter {
  postMessage = vi.fn();
  terminate = vi.fn().mockResolvedValue(1);
}

describe('OcrEngine', () => {
  it('passes OCR through an isolated worker and transfers image data', async () => {
    const worker = new FakeWorker();
    const factory = vi.fn(() => worker as unknown as Worker);
    const engine = new OcrEngine('eng', 'auto', 1000, factory);
    const recognition = engine.recognize(Buffer.from([1, 2, 3]));

    worker.emit('message', { type: 'ready' });
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledOnce());
    const request = worker.postMessage.mock.calls[0][0] as { id: number };
    worker.emit('message', { type: 'result', id: request.id, text: 'Hello', confidence: 95 });

    await expect(recognition).resolves.toEqual({ text: 'Hello', confidence: 95 });
    await engine.terminate();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates the worker and rejects recognition after a fatal worker error', async () => {
    const worker = new FakeWorker();
    const engine = new OcrEngine('eng', 'auto', 1000, () => worker as unknown as Worker);
    const recognition = engine.recognize(Buffer.from([1]));

    worker.emit('message', { type: 'ready' });
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledOnce());
    worker.emit('message', { type: 'fatal', error: 'decoder failed' });

    await expect(recognition).rejects.toThrow('decoder failed');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates a worker that does not initialize before the timeout', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const engine = new OcrEngine('eng', 'auto', 1000, () => worker as unknown as Worker);
    const recognition = engine.recognize(Buffer.from([1]));
    const rejection = expect(recognition).rejects.toThrow('initialization timed out');

    await vi.advanceTimersByTimeAsync(1000);

    await rejection;
    expect(worker.terminate).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('replaces a timed-out worker and ignores its late events', async () => {
    vi.useFakeTimers();
    const firstWorker = new FakeWorker();
    const secondWorker = new FakeWorker();
    const factory = vi
      .fn()
      .mockReturnValueOnce(firstWorker as unknown as Worker)
      .mockReturnValueOnce(secondWorker as unknown as Worker);
    const engine = new OcrEngine('eng', 'auto', 1000, factory);

    const firstRecognition = engine.recognize(Buffer.from([1]));
    firstWorker.emit('message', { type: 'ready' });
    await vi.waitFor(() => expect(firstWorker.postMessage).toHaveBeenCalledOnce());
    const firstRejection = expect(firstRecognition).rejects.toThrow('recognition timed out');
    await vi.advanceTimersByTimeAsync(1000);
    await firstRejection;

    const secondRecognition = engine.recognize(Buffer.from([2]));
    firstWorker.emit('message', { type: 'fatal', error: 'late failure' });
    secondWorker.emit('message', { type: 'ready' });
    await vi.waitFor(() => expect(secondWorker.postMessage).toHaveBeenCalledOnce());
    const request = secondWorker.postMessage.mock.calls[0][0] as { id: number };
    secondWorker.emit('message', { type: 'result', id: request.id, text: 'Recovered', confidence: 90 });

    await expect(secondRecognition).resolves.toEqual({ text: 'Recovered', confidence: 90 });
    expect(secondWorker.terminate).not.toHaveBeenCalled();
    await engine.terminate();
    vi.useRealTimers();
  });

  it('rejects immediately when posting to the worker fails', async () => {
    const worker = new FakeWorker();
    worker.postMessage.mockImplementation(() => {
      throw new Error('post failed');
    });
    const engine = new OcrEngine('eng', 'auto', 1000, () => worker as unknown as Worker);
    const recognition = engine.recognize(Buffer.from([1]));

    worker.emit('message', { type: 'ready' });

    await expect(recognition).rejects.toThrow('post failed');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
