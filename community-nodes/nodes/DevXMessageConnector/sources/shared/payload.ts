function makeSerializable(input: unknown): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input !== 'object') {
    return typeof input === 'bigint' ? input.toString() : input;
  }

  const seen = new WeakSet<object>();
  const serialized = JSON.stringify(input, (_key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }

      seen.add(value);
    }

    return value;
  });

  return serialized === undefined ? undefined : JSON.parse(serialized);
}

export function safeParsePayload<T>(input: unknown): T | null {
  if (typeof input !== 'string') {
    return makeSerializable(input) as T;
  }

  try {
    return JSON.parse(input) as T;
  } catch (error) {
    console.error('Failed to parse payload JSON:', error);
    return null;
  }
}

export function safeStringifyPayload(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }

  const serialized = makeSerializable(input);
  return serialized === undefined ? '' : JSON.stringify(serialized);
}

export function toSerializableNodeJson(input: unknown): Record<string, unknown> {
  const serialized = makeSerializable(input);

  if (serialized && typeof serialized === 'object' && !Array.isArray(serialized)) {
    return serialized as Record<string, unknown>;
  }

  if (serialized === undefined) {
    return {};
  }

  return { value: serialized };
}
