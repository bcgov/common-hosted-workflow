export function safeParsePayload<T>(input: unknown): T | null {
  if (typeof input !== 'string') {
    return input as T;
  }

  try {
    return JSON.parse(input) as T;
  } catch (error) {
    console.error('Failed to parse payload JSON:', error);
    return null;
  }
}
