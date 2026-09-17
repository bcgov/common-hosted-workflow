import axios from 'axios';

/**
 * Extracts a user-friendly error message from various error shapes.
 * Handles Axios errors (with server-provided messages), generic Error instances,
 * and unknown error types.
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const serverMessage =
      (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message ??
      (err.response?.data as { message?: string } | undefined)?.message;
    return serverMessage ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

/** User-facing message shown when the upstream/callback target is unreachable or timed out. */
export const SERVER_UNAVAILABLE_MESSAGE = 'The service is temporarily unavailable. Please try again later.';

/**
 * HTTP status codes the backend returns when a callback's upstream target is
 * unreachable (502) or timed out (504) — i.e. "server down" rather than a
 * permanent rejection. In these cases the action is still valid and retryable.
 */
const SERVER_UNAVAILABLE_STATUS_CODES: ReadonlySet<number> = new Set([502, 504]);

/** Returns true when the error is a callback "server down"/timeout response (502/504). */
export function isServerUnavailableError(err: unknown): boolean {
  return (
    axios.isAxiosError(err) && err.response !== undefined && SERVER_UNAVAILABLE_STATUS_CODES.has(err.response.status)
  );
}
