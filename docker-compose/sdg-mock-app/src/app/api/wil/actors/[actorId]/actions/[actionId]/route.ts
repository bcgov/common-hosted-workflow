import { NextRequest, NextResponse } from 'next/server';
import { wilPatch } from '@/lib/wil-proxy';
import { resolvePlaygroundConfig } from '@/lib/playground-resolve';
import type { ResolvedConfig } from '@/lib/playground-resolve';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ actorId: string; actionId: string }> },
) {
  const { actorId, actionId } = await params;

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

  const body = await request.json();
  const upstream = await wilPatch(
    `/actors/${encodeURIComponent(actorId)}/actions/${encodeURIComponent(actionId)}`,
    body,
    config,
  );
  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
