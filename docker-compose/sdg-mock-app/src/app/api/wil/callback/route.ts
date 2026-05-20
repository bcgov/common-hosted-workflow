import { NextRequest, NextResponse } from 'next/server';
import { wilCallback, wilGetAction, wilPatch } from '@/lib/wil-proxy';
import { requirePlaygroundConfigFromHeader } from '@/lib/playground-resolve';

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
  const resolved = requirePlaygroundConfigFromHeader(request);
  if (!resolved.ok) return resolved.response;

  const { actionId, body } = await request.json();

  if (!actionId || typeof actionId !== 'string') {
    return NextResponse.json({ error: 'actionId is required' }, { status: 400 });
  }

  // Fetch the full action (with callbackUrl) from the WIL API server-side
  const actionResp = await wilGetAction(actionId, resolved.config);
  if (!actionResp.ok) {
    const errText = await actionResp.text();
    return NextResponse.json(
      { error: `Failed to fetch action ${actionId}: ${errText}` },
      { status: actionResp.status },
    );
  }

  const action = await actionResp.json();
  const callbackMethod = ((action.callbackMethod as string) || '').toUpperCase();
  const callbackUrl = action.callbackUrl as string | undefined;

  // When callbackMethod is "None", skip the callback and just mark the action completed
  if (callbackMethod === 'NONE' || !callbackUrl) {
    const patchResp = await wilPatch(
      `/actions/${encodeURIComponent(actionId)}`,
      { status: 'completed' },
      resolved.config,
    );
    if (!patchResp.ok) {
      const errBody = await patchResp.text();
      return NextResponse.json(
        { error: `Failed to mark action ${actionId} as completed: ${errBody}` },
        { status: patchResp.status },
      );
    }
    return NextResponse.json({ completed: true, actionId });
  }

  const upstream = await wilCallback(callbackUrl, callbackMethod || 'POST', body ?? {}, resolved.config);

  // After a successful callback, mark the action as completed
  if (upstream.ok) {
    const patchResp = await wilPatch(
      `/actions/${encodeURIComponent(actionId)}`,
      { status: 'completed' },
      resolved.config,
    );
    if (!patchResp.ok) {
      console.error(`[callback] Failed to mark action ${actionId} as completed: ${patchResp.status}`);
    }
  }

  // Try to return JSON; fall back to text
  const contentType = upstream.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  }
  const text = await upstream.text();
  return new NextResponse(text, { status: upstream.status });
}
