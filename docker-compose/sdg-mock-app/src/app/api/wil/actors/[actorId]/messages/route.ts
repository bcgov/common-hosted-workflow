import { NextRequest, NextResponse } from 'next/server';
import { wilGet } from '@/lib/wil-proxy';
import { resolvePlaygroundConfig } from '@/lib/playground-resolve';
import type { ResolvedConfig } from '@/lib/playground-resolve';

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
  const upstream = await wilGet(`/actors/${encodeURIComponent(actorId)}/messages`, sp, config);
  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
