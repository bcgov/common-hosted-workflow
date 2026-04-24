import { NextRequest, NextResponse } from 'next/server';
import { wilGet } from '@/lib/wil-proxy';
import { requirePlaygroundConfigFromHeader } from '@/lib/playground-resolve';

export async function GET(request: NextRequest, { params }: { params: Promise<{ actorId: string }> }) {
  const { actorId } = await params;

  const resolved = requirePlaygroundConfigFromHeader(request);
  if (!resolved.ok) return resolved.response;

  const sp = request.nextUrl.searchParams;
  const upstream = await wilGet(`/actors/${encodeURIComponent(actorId)}/messages`, sp, resolved.config);
  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
