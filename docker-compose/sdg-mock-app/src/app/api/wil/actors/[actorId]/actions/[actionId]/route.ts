import { NextRequest, NextResponse } from 'next/server';
import { wilPatch } from '@/lib/wil-proxy';
import { requirePlaygroundConfigFromHeader } from '@/lib/playground-resolve';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ actorId: string; actionId: string }> },
) {
  const { actorId, actionId } = await params;

  const resolved = requirePlaygroundConfigFromHeader(request);
  if (!resolved.ok) return resolved.response;

  const body = await request.json();
  const upstream = await wilPatch(
    `/actors/${encodeURIComponent(actorId)}/actions/${encodeURIComponent(actionId)}`,
    body,
    resolved.config,
  );
  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
