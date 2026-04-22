import { NextRequest, NextResponse } from 'next/server';
import { wilGet } from '@/lib/wil-proxy';
import { resolvePlaygroundConfig } from '@/lib/playground-resolve';
import type { ResolvedConfig } from '@/lib/playground-resolve';

/**
 * Fields that must never reach the browser.
 * - callbackUrl / callbackMethod / callbackPayloadSpec contain signed webhook
 *   URLs and internal routing details.
 * - Payload keys like FormAPIKey are API secrets.
 */
const SENSITIVE_PAYLOAD_KEYS = new Set(['formapikey']);

function sanitizeAction(action: Record<string, unknown>): Record<string, unknown> {
  const { callbackUrl, callbackMethod, callbackPayloadSpec, ...safe } = action;

  if (safe.payload && typeof safe.payload === 'object' && !Array.isArray(safe.payload)) {
    const payload = { ...(safe.payload as Record<string, unknown>) };
    for (const key of Object.keys(payload)) {
      if (SENSITIVE_PAYLOAD_KEYS.has(key.toLowerCase())) {
        delete payload[key];
      }
    }
    safe.payload = payload;
  }

  return safe;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ actorId: string }> }) {
  const { actorId } = await params;

  // Resolve playground-specific config when the header is present
  const playgroundName = request.headers.get('x-playground-id');
  const config: ResolvedConfig | undefined = (() => {
    if (playgroundName === null) return undefined;
    const resolved = resolvePlaygroundConfig(playgroundName);
    return resolved ?? undefined;
  })();
  if (playgroundName !== null && config === undefined) {
    return NextResponse.json({ error: 'Playground not found' }, { status: 404 });
  }

  const sp = request.nextUrl.searchParams;
  const upstream = await wilGet(`/actors/${encodeURIComponent(actorId)}/actions`, sp, config);
  const data = await upstream.json();

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  // Sanitize before returning to the browser
  if (data && typeof data === 'object' && Array.isArray(data.items)) {
    data.items = data.items.map(sanitizeAction);
  } else if (Array.isArray(data)) {
    return NextResponse.json(data.map(sanitizeAction), { status: upstream.status });
  }

  return NextResponse.json(data, { status: upstream.status });
}
