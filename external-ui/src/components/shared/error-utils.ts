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
