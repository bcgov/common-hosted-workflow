import { NextResponse } from 'next/server';

/**
 * Safely parse a JSON request body and verify it is a plain object.
 *
 * Returns `{ ok: true, data }` on success, or `{ ok: false, response }` with
 * an appropriate 400 NextResponse when the body is not valid JSON or not an object.
 */
export async function parseJsonObjectBody(
  request: Request,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 }) };
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 }),
    };
  }

  return { ok: true, data: body as Record<string, unknown> };
}

/**
 * Assert that `data[field]` exists and is a non-empty string.
 *
 * Returns `{ ok: true, value }` when the field is present, or
 * `{ ok: false, response }` with a 400 NextResponse otherwise.
 */
export function requireStringField(
  data: Record<string, unknown>,
  field: string,
): { ok: true; value: string } | { ok: false; response: NextResponse } {
  if (!Object.hasOwn(data, field) || typeof data[field] !== 'string' || data[field].length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 }),
    };
  }

  return { ok: true, value: data[field] };
}
