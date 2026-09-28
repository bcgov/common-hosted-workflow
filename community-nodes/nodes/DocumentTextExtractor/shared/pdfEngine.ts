import path from 'node:path';
import { Worker as NodeWorker, type WorkerOptions } from 'node:worker_threads';
import { getErrorMessage } from './errors';
import type { PdfInspectionResult, PdfProvider, PdfTextResult } from './pdfProvider';
import { rethrowAfterCleanup, WorkerShutdown } from './lifecycle';

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface PdfWorkerMessage {
  type: 'ready' | 'result' | 'error';
  id?: number;
  result?: unknown;
  error?: string;
}

type WorkerFactory = (filename: string, options: WorkerOptions) => NodeWorker;

export class PdfEngine implements PdfProvider {
  private readonly worker: NodeWorker;
  private readonly readyPromise: Promise<void>;
  private rejectReady?: (error: Error) => void;
  private readyTimer?: NodeJS.Timeout;
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private terminated = false;
  private readonly shutdown = new WorkerShutdown();

  constructor(
    buffer: Buffer,
    password: string | undefined,
    timeoutMs: number,
    workerFactory: WorkerFactory = (filename, options) => new NodeWorker(filename, options),
  ) {
    const data = Uint8Array.from(buffer);
    this.worker = workerFactory(path.join(__dirname, 'pdfWorker.js'), {
      workerData: { data, password },
      transferList: [data.buffer],
      resourceLimits: { maxOldGenerationSizeMb: 384, stackSizeMb: 8 },
    });

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.rejectReady = reject;
      this.readyTimer = setTimeout(() => {
        this.fail(new Error(`PDF worker initialization timed out after ${timeoutMs} ms`));
      }, timeoutMs);

      this.worker.on('message', (message: PdfWorkerMessage) => {
        if (this.terminated) return;
        if (message.type === 'ready') {
          if (this.readyTimer) clearTimeout(this.readyTimer);
          this.readyTimer = undefined;
          this.rejectReady = undefined;
          resolve();
          return;
        }

        if (message.id === undefined) return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.type === 'result') pending.resolve(message.result);
        else pending.reject(new Error(message.error || 'PDF operation failed'));
      });
      this.worker.on('error', (error) => this.fail(new Error(getErrorMessage(error))));
      this.worker.on('exit', (code) => {
        if (!this.terminated) this.fail(new Error(`PDF worker exited with code ${code}`));
      });
    });
    // Initialization can fail before the first request is made.
    void this.readyPromise.catch(() => undefined);
  }

  private fail(error: Error): void {
    if (this.terminated) return;
    this.terminated = true;
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = undefined;
    this.rejectReady?.(error);
    this.rejectReady = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.shutdown.start(this.worker);
  }

  private async request<T>(request: Record<string, unknown>, timeoutMs: number, operation: string): Promise<T> {
    try {
      return await this.requestWithWorker<T>(request, timeoutMs, operation);
    } catch (error) {
      return await rethrowAfterCleanup(error, async () => await this.shutdown.wait());
    }
  }

  private async requestWithWorker<T>(
    request: Record<string, unknown>,
    timeoutMs: number,
    operation: string,
  ): Promise<T> {
    const startedAt = Date.now();
    await this.readyPromise;
    if (this.terminated) throw new Error('PDF worker is unavailable');
    const operationTimeoutMs = timeoutMs - (Date.now() - startedAt);
    if (operationTimeoutMs <= 0) {
      const error = new Error(`${operation} timed out after ${timeoutMs} ms`);
      this.fail(error);
      throw error;
    }

    const id = this.nextRequestId++;
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error(`${operation} timed out after ${timeoutMs} ms`));
      }, operationTimeoutMs);
      this.pending.set(id, { resolve: resolve as (result: unknown) => void, reject, timer });
      try {
        this.worker.postMessage({ ...request, id });
      } catch (error) {
        this.fail(new Error(getErrorMessage(error)));
      }
    });
  }

  async getText(maxPages: number, timeoutMs: number): Promise<PdfTextResult> {
    return await this.request({ operation: 'getText', maxPages }, timeoutMs, 'PDF text extraction');
  }

  async inspect(pageNumbers: number[] | undefined, maxPages: number, timeoutMs: number): Promise<PdfInspectionResult> {
    return await this.request({ operation: 'inspect', pageNumbers, maxPages }, timeoutMs, 'PDF inspection');
  }

  async renderPage(pageNumber: number, scale: number, timeoutMs: number): Promise<Uint8Array> {
    return await this.request(
      { operation: 'renderPage', pageNumber, scale },
      timeoutMs,
      `Rendering PDF page ${pageNumber}`,
    );
  }

  async terminate(): Promise<void> {
    this.fail(new Error('PDF worker terminated'));
    await this.shutdown.wait();
  }
}
