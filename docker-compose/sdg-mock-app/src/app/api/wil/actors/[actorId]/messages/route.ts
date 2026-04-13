import { NextRequest, NextResponse } from 'next/server';
import { wilGet } from '@/lib/wil-proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ actorId: string }> }) {
  const { actorId } = await params;
  const sp = request.nextUrl.searchParams;
  const upstream = await wilGet(`/actors/${encodeURIComponent(actorId)}/messages`, sp);
  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
