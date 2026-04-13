import { NextRequest, NextResponse } from 'next/server';
import { wilPatch } from '@/lib/wil-proxy';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ actorId: string; actionId: string }> },
) {
  const { actorId, actionId } = await params;
  const body = await request.json();
  const upstream = await wilPatch(
    `/actors/${encodeURIComponent(actorId)}/actions/${encodeURIComponent(actionId)}`,
    body,
  );
  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
