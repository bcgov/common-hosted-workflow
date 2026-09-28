import { getErrorMessage } from './errors';

/** A rejected shutdown cannot prove exit; callers must not start another document. */
export class WorkerCleanupError extends Error {
  constructor(
    readonly cleanupError: unknown,
    originalError?: unknown,
  ) {
    super(
      `${originalError === undefined ? '' : `${getErrorMessage(originalError)}; `}Worker cleanup failed: ${getErrorMessage(cleanupError)}`,
      { cause: originalError ?? cleanupError },
    );
  }
}

/** Retain a single shutdown, including rejection, even when initiated by an event. */
export class WorkerShutdown {
  private completion?: Promise<void>;

  start(worker: { terminate(): Promise<number> }): void {
    if (this.completion) return;
    this.completion = Promise.resolve().then(async () => {
      await worker.terminate();
    });
    // Event handlers cannot await. Observe immediately, and rethrow to every waiter.
    void this.completion.catch(() => undefined);
  }

  async wait(): Promise<void> {
    await this.completion;
  }
}

export async function rethrowAfterCleanup(error: unknown, cleanup: () => Promise<void>): Promise<never> {
  try {
    await cleanup();
  } catch (cleanupError) {
    if (error instanceof WorkerCleanupError) throw error;
    throw new WorkerCleanupError(cleanupError, error);
  }
  throw error;
}

export async function withCleanup<T>(operation: () => Promise<T>, cleanup: () => Promise<void>): Promise<T> {
  let result: T;
  try {
    result = await operation();
  } catch (error) {
    return await rethrowAfterCleanup(error, cleanup);
  }
  try {
    await cleanup();
  } catch (error) {
    throw new WorkerCleanupError(error);
  }
  return result;
}
