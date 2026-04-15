import { NextRequest, NextResponse } from 'next/server';
import { wilCallback, wilGetAction } from '@/lib/wil-proxy';

/**
 * Secure callback proxy.
 *
 * The frontend POSTs:  { actionId, body }
 *
 * The backend fetches the action from the WIL API to obtain the
 * callbackUrl and callbackMethod, then forwards the request.
 * This keeps signed webhook URLs and callback details server-side only.
 */
export async function POST(request: NextRequest) {
  const { actionId, body } = await request.json();

  if (!actionId || typeof actionId !== 'string') {
    return NextResponse.json({ error: 'actionId is required' }, { status: 400 });
  }

  // Fetch the full action (with callbackUrl) from the WIL API server-side
  const actionResp = await wilGetAction(actionId);
  if (!actionResp.ok) {
    const errText = await actionResp.text();
    return NextResponse.json(
      { error: `Failed to fetch action ${actionId}: ${errText}` },
      { status: actionResp.status },
    );
  }

  const action = await actionResp.json();
  const callbackUrl = action.callbackUrl as string | undefined;
  if (!callbackUrl) {
    return NextResponse.json({ error: 'Action has no callbackUrl' }, { status: 404 });
  }

  const method = ((action.callbackMethod as string) || 'POST').toUpperCase();
  const upstream = await wilCallback(callbackUrl, method, body ?? {});

  // Try to return JSON; fall back to text
  const contentType = upstream.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  }
  const text = await upstream.text();
  return new NextResponse(text, { status: upstream.status });
}
