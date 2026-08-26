import path from 'node:path';
import { Worker as NodeWorker, type WorkerOptions } from 'node:worker_threads';
import { PSM } from 'tesseract.js';
import { getErrorMessage } from './errors';
import type { OcrProvider, PageSegmentationMode } from './extractor';

interface PendingRecognition {
  resolve: (result: { text: string; confidence: number }) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface OcrWorkerMessage {
  type: 'ready' | 'result' | 'error' | 'fatal';
  id?: number;
  text?: string;
  confidence?: number;
  error?: string;
}

const PSM_BY_MODE: Record<PageSegmentationMode, PSM> = {
  auto: PSM.AUTO,
  singleBlock: PSM.SINGLE_BLOCK,
  singleColumn: PSM.SINGLE_COLUMN,
  sparseText: PSM.SPARSE_TEXT,
};

type WorkerFactory = (filename: string, options: WorkerOptions) => NodeWorker;

export class OcrEngine implements OcrProvider {
  private worker?: NodeWorker;
  private readyPromise?: Promise<void>;
  private rejectReady?: (error: Error) => void;
  private readyTimer?: NodeJS.Timeout;
  private readonly pending = new Map<number, PendingRecognition>();
  private nextRequestId = 1;

  constructor(
    private readonly language: string,
    private readonly pageSegmentationMode: PageSegmentationMode,
    private readonly timeoutMs: number,
    private readonly workerFactory: WorkerFactory = (filename, options) => new NodeWorker(filename, options),
  ) {}

  private async ensureWorker(timeoutMs = this.timeoutMs): Promise<void> {
    if (this.readyPromise) return await this.readyPromise;

    const worker = this.workerFactory(path.join(__dirname, 'ocrWorker.js'), {
      workerData: {
        language: this.language,
        pageSegmentationMode: PSM_BY_MODE[this.pageSegmentationMode],
      },
      resourceLimits: { maxOldGenerationSizeMb: 256, stackSizeMb: 8 },
    });
    this.worker = worker;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.rejectReady = reject;
      const initializationTimeoutMs = Math.min(this.timeoutMs, timeoutMs);
      this.readyTimer = setTimeout(() => {
        const error = new Error(`OCR worker initialization timed out after ${initializationTimeoutMs} ms`);
        this.resetWorker(error);
      }, initializationTimeoutMs);

      worker.on('message', (message: OcrWorkerMessage) => {
        if (this.worker !== worker) return;
        if (message.type === 'ready') {
          if (this.readyTimer) clearTimeout(this.readyTimer);
          this.readyTimer = undefined;
          this.rejectReady = undefined;
          resolve();
          return;
        }
        this.handleMessage(message);
      });
      worker.on('error', (error) => {
        if (this.worker === worker) this.resetWorker(new Error(getErrorMessage(error)));
      });
      worker.on('exit', (code) => {
        if (this.worker === worker) {
          this.resetWorker(new Error(`OCR worker exited with code ${code}`));
        }
      });
    });

    return await this.readyPromise;
  }

  private handleMessage(message: OcrWorkerMessage): void {
    if (message.type === 'fatal') {
      this.resetWorker(new Error(message.error || 'OCR worker failed'));
      return;
    }
    if (message.id === undefined) return;

    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);

    if (message.type === 'result') {
      pending.resolve({ text: message.text ?? '', confidence: message.confidence ?? 0 });
    } else {
      pending.reject(new Error(message.error || 'OCR recognition failed'));
    }
  }

  private resetWorker(error: Error): void {
    const worker = this.worker;
    this.worker = undefined;
    this.readyPromise = undefined;
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = undefined;
    this.rejectReady?.(error);
    this.rejectReady = undefined;

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    if (worker) void worker.terminate();
  }

  async recognize(
    image: Buffer | Uint8Array,
    timeoutMs = this.timeoutMs,
  ): Promise<{ text: string; confidence: number }> {
    const startedAt = Date.now();
    await this.ensureWorker(timeoutMs);
    const worker = this.worker;
    if (!worker) throw new Error('OCR worker is unavailable');
    const recognitionTimeoutMs = timeoutMs - (Date.now() - startedAt);
    if (recognitionTimeoutMs <= 0) throw new Error(`OCR recognition timed out after ${timeoutMs} ms`);

    const requestId = this.nextRequestId++;
    const imageCopy = Uint8Array.from(image);

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resetWorker(new Error(`OCR recognition timed out after ${timeoutMs} ms`));
      }, recognitionTimeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        worker.postMessage({ id: requestId, image: imageCopy }, [imageCopy.buffer]);
      } catch (error) {
        this.resetWorker(new Error(getErrorMessage(error)));
      }
    });
  }

  async terminate(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    this.readyPromise = undefined;
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = undefined;
    this.rejectReady = undefined;

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('OCR worker terminated'));
    }
    this.pending.clear();
    if (worker) await worker.terminate();
  }
}
