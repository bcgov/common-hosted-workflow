import { EventEmitter } from 'node:events';
import type { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OcrEngine } from '../../nodes/DocumentTextExtractor/shared/ocrEngine';
import { PdfEngine } from '../../nodes/DocumentTextExtractor/shared/pdfEngine';
import { WorkerCleanupError } from '../../nodes/DocumentTextExtractor/shared/lifecycle';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

class DeferredWorker extends EventEmitter {
  exit = deferred<number>();
  postMessage = vi.fn();
  terminate = vi.fn(() => this.exit.promise);
}

function setup(kind: 'OCR' | 'PDF', worker = new DeferredWorker()) {
  const factory = vi.fn(() => worker as unknown as Worker);
  const engine =
    kind === 'OCR'
      ? new OcrEngine('eng', 'auto', 1000, factory)
      : new PdfEngine(Buffer.from('%PDF'), undefined, 1000, factory);
  const request = () => (engine instanceof OcrEngine ? engine.recognize(Buffer.from([1])) : engine.getText(1, 1000));
  return { worker, factory, engine, request };
}

afterEach(() => vi.useRealTimers());

describe.each(['OCR', 'PDF'] as const)('%s awaited worker lifecycle', (kind) => {
  it.each([
    'initialization timeout',
    'operation timeout',
    'initialization error',
    'worker error',
    'exit',
    'post failure',
  ])('retains shutdown after %s, ignores late events, and settles repeated cleanup together', async (failure) => {
    vi.useFakeTimers();
    const { worker, engine, request } = setup(kind);
    const outcome = vi.fn();
    const operation = request().then(
      () => outcome('unexpected success'),
      (error: Error) => outcome(error),
    );
    if (failure === 'post failure')
      worker.postMessage.mockImplementation(() => {
        throw new Error('post failed');
      });
    if (!failure.startsWith('initialization')) {
      worker.emit('message', { type: 'ready' });
      await vi.advanceTimersByTimeAsync(0);
    }
    if (failure.endsWith('timeout')) await vi.advanceTimersByTimeAsync(1000);
    else if (failure.endsWith('error')) worker.emit('error', new Error('worker failed'));
    else if (failure === 'exit') worker.emit('exit', 1);

    await vi.advanceTimersByTimeAsync(0);
    expect(worker.terminate).toHaveBeenCalledOnce();
    const cleanupSettled = vi.fn();
    const cleanup1 = engine.terminate().then(cleanupSettled);
    const cleanup2 = engine.terminate().then(cleanupSettled);
    worker.emit('message', { type: 'ready' });
    worker.emit('message', { type: 'result', id: 1, text: 'late', result: { total: 1, pages: [] } });
    worker.emit('error', new Error('late error'));
    worker.emit('exit', 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome).not.toHaveBeenCalled();
    expect(cleanupSettled).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
    worker.exit.resolve(1);
    await Promise.all([operation, cleanup1, cleanup2]);
    expect(outcome.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(outcome.mock.calls[0][0].message).toMatch(/timed out|worker failed|exited|post failed/);
    expect(cleanupSettled).toHaveBeenCalledTimes(2);
    await engine.terminate();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects in-flight initialization on explicit termination, after exit', async () => {
    vi.useFakeTimers();
    const { worker, engine, request } = setup(kind);
    const settled = vi.fn();
    const operation = request().catch(settled);
    const cleanup = engine.terminate();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    worker.exit.resolve(1);
    await Promise.all([operation, cleanup]);
    expect(settled.mock.calls[0][0].message).toContain('worker terminated');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retains rejected shutdown, preserves the extraction error, and never replaces the worker', async () => {
    vi.useFakeTimers();
    const { worker, factory, engine, request } = setup(kind);
    const operation = request();
    const rejection = expect(operation).rejects.toBeInstanceOf(WorkerCleanupError);
    worker.emit('error', new Error('original worker failure'));
    await vi.advanceTimersByTimeAsync(0);
    worker.exit.reject(new Error('exit rejected'));
    await rejection;
    await expect(operation).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'original worker failure' }),
      cleanupError: expect.objectContaining({ message: 'exit rejected' }),
    });
    await expect(engine.terminate()).rejects.toThrow('exit rejected');
    await expect(engine.terminate()).rejects.toThrow('exit rejected');
    await expect(request()).rejects.toThrow('exit rejected');
    expect(factory).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('observes synchronous shutdown throws as cleanup rejection', async () => {
    const { worker, engine, request } = setup(kind);
    worker.terminate.mockImplementation(() => {
      throw new Error('terminate threw');
    });
    const operation = request();
    worker.emit('error', new Error('original failure'));
    await expect(operation).rejects.toThrow('original failure; Worker cleanup failed: terminate threw');
    await expect(engine.terminate()).rejects.toThrow('terminate threw');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates if initialization consumes the entire operation budget', async () => {
    vi.useFakeTimers();
    const { worker, engine, request } = setup(kind);
    const operation = request();
    const rejection = expect(operation).rejects.toThrow('timed out');
    // Advance the clock without firing the initialization timer, then deliver ready.
    vi.setSystemTime(Date.now() + 1000);
    worker.emit('message', { type: 'ready' });
    await vi.advanceTimersByTimeAsync(0);
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
    worker.exit.resolve(1);
    await rejection;
    await engine.terminate();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('OCR replacement', () => {
  it.each(['fatal', 'timeout'])('cannot replace a worker after %s until deferred exit completes', async (failure) => {
    vi.useFakeTimers();
    const first = new DeferredWorker();
    const second = new DeferredWorker();
    const { factory, engine, request } = setup('OCR', first);
    factory.mockReturnValueOnce(first as unknown as Worker).mockReturnValueOnce(second as unknown as Worker);
    const firstOutcome = vi.fn();
    const firstRequest = request().catch(firstOutcome);
    first.emit('message', { type: 'ready' });
    await vi.advanceTimersByTimeAsync(0);
    if (failure === 'fatal') first.emit('message', { type: 'fatal', error: 'decoder failed' });
    else await vi.advanceTimersByTimeAsync(1000);
    const next = request();
    await vi.advanceTimersByTimeAsync(0);
    expect(firstOutcome).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledOnce();
    expect(second.postMessage).not.toHaveBeenCalled();
    first.exit.resolve(1);
    await firstRequest;
    await vi.advanceTimersByTimeAsync(0);
    expect(factory).toHaveBeenCalledTimes(2);
    second.emit('message', { type: 'ready' });
    first.emit('message', { type: 'fatal', error: 'late failure' });
    first.emit('exit', 0);
    await vi.advanceTimersByTimeAsync(0);
    const { id } = second.postMessage.mock.calls[0][0];
    second.emit('message', { type: 'result', id, text: 'Recovered', confidence: 99 });
    await expect(next).resolves.toEqual({ text: 'Recovered', confidence: 99 });
    second.exit.resolve(1);
    await engine.terminate();
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(second.terminate).toHaveBeenCalledOnce();
  });
});

it('observes PDF initialization failure even before a request is made', async () => {
  vi.useFakeTimers();
  const { worker, engine } = setup('PDF');
  await vi.advanceTimersByTimeAsync(1000);
  worker.exit.reject(new Error('exit rejected'));
  await vi.advanceTimersByTimeAsync(0);
  await expect(engine.terminate()).rejects.toThrow('exit rejected');
  expect(vi.getTimerCount()).toBe(0);
});
