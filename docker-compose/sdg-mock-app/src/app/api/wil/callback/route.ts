import { NextRequest, NextResponse } from 'next/server';
import { wilCallback } from '@/lib/wil-proxy';

/**
 * Generic callback proxy. The frontend POSTs here with:
 *   { callbackUrl, method, body }
 * and we forward the request server-side with WIL credentials.
 */
export async function POST(request: NextRequest) {
  const { callbackUrl, method, body } = await request.json();

  if (!callbackUrl || typeof callbackUrl !== 'string') {
    return NextResponse.json({ error: 'callbackUrl is required' }, { status: 400 });
  }

  const upstream = await wilCallback(callbackUrl, method || 'POST', body ?? {});

  // Try to return JSON; fall back to text
  const contentType = upstream.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  }
  const text = await upstream.text();
  return new NextResponse(text, { status: upstream.status });
}
