import { NextRequest, NextResponse } from 'next/server';
import { getPlaygroundButtonTriggers } from '@/lib/playground-db';
import { mapTriggerRecord } from '@/lib/playground-resolve';

/**
 * GET /api/chefs/actors/{actorId}/triggers
 *
 * Returns the list of button triggers configured for the playground.
 * Only non-sensitive display data is returned (id, buttonText, method).
 * The webhookUrl is intentionally omitted — it is resolved server-side
 * when the trigger is fired.
 *
 * The X-PLAYGROUND-ID header is required.
 */
export async function GET(request: NextRequest) {
  const playgroundName = request.headers.get('x-playground-id');

  if (!playgroundName) {
    return NextResponse.json({ error: 'X-PLAYGROUND-ID header is required' }, { status: 400 });
  }

  const records = getPlaygroundButtonTriggers(playgroundName);
  const triggers = records.map(mapTriggerRecord).map(({ id, buttonText, method }) => ({
    id,
    buttonText,
    method,
  }));

  return NextResponse.json({ triggers });
}
