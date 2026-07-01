import { AppError } from '../../utils/errors';

/**
 * Calls an external webhook URL and returns the raw Response.
 * Translates timeout errors to 504 and network errors to 502 AppErrors,
 * using the caller-supplied messages so each context can give a meaningful description.
 */
export async function callWebhook({
  url,
  method,
  body,
  timeoutMs,
  timeoutMessage,
  unreachableMessage,
}: {
  url: string;
  method: string;
  body?: string;
  timeoutMs: number;
  timeoutMessage: string;
  unreachableMessage: string;
}): Promise<globalThis.Response> {
  try {
    return await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new AppError(504, timeoutMessage);
    }
    throw new AppError(502, unreachableMessage);
  }
}
