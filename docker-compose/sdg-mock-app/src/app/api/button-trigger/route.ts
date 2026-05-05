import { NextRequest, NextResponse } from 'next/server';
import { resolvePlaygroundConfig } from '@/lib/playground-resolve';
import { getPlaygroundButtonTriggers } from '@/lib/playground-db';
import { trimTrailingSlashes } from '@/lib/url';

/**
 * POST /api/button-trigger
 *
 * Executes a button trigger's webhook call on behalf of the user.
 * The frontend sends { triggerId, actorId } and the backend resolves
 * the trigger configuration from the playground database, builds the
 * request (optionally injecting actorId), and calls the webhook.
 *
 * The X-PLAYGROUND-ID header is required.
 */
export async function POST(request: NextRequest) {
  const playgroundName = request.headers.get('x-playground-id');

  if (!playgroundName) {
    return NextResponse.json({ error: 'X-PLAYGROUND-ID header is required' }, { status: 400 });
  }

  const { triggerId, actorId } = await request.json();

  if (typeof triggerId !== 'number') {
    return NextResponse.json({ error: 'triggerId is required and must be a number' }, { status: 400 });
  }

  const pgConfig = resolvePlaygroundConfig(playgroundName);
  if (!pgConfig) {
    return NextResponse.json({ error: 'Playground not found' }, { status: 404 });
  }

  const triggers = getPlaygroundButtonTriggers(playgroundName);
  const trigger = triggers.find((t) => t.id === triggerId);
  if (!trigger) {
    return NextResponse.json({ error: 'Button trigger not found' }, { status: 404 });
  }

  const n8nTarget = trimTrailingSlashes(pgConfig.n8nTarget || '');

  // Rewrite localhost:5678 URLs to the internal Docker hostname
  const webhookUrl = trigger.webhook_url.replace(/^https?:\/\/localhost:5678/, n8nTarget);

  const method = trigger.method.toUpperCase();

  try {
    const result = await executeWebhook(method, webhookUrl, trigger, actorId);
    return result;
  } catch (err) {
    console.error('[button-trigger] Webhook call failed:', err);
    return NextResponse.json({ error: 'Webhook call failed' }, { status: 502 });
  }
}

/** Build and execute the webhook request based on trigger configuration. */
async function executeWebhook(
  method: string,
  webhookUrl: string,
  trigger: { post_body: string; include_actor_id: number },
  actorId: string | undefined,
): Promise<NextResponse> {
  if (method === 'GET') {
    const url = trigger.include_actor_id && actorId ? appendActorParam(webhookUrl, actorId) : webhookUrl;
    const resp = await fetch(url, { method: 'GET' });
    return buildWebhookResponse(resp);
  }

  // POST — parse the configured body, warn if invalid JSON
  let body: Record<string, unknown> = {};
  if (trigger.post_body.trim()) {
    try {
      body = JSON.parse(trigger.post_body) as Record<string, unknown>;
    } catch {
      console.warn('[button-trigger] Invalid JSON in post_body, sending empty object');
      body = {};
    }
  }

  if (trigger.include_actor_id && actorId) {
    body.actorId = actorId;
  }

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return buildWebhookResponse(resp);
}

function appendActorParam(url: string, actorId: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}actorId=${encodeURIComponent(actorId)}`;
}

async function buildWebhookResponse(resp: Response): Promise<NextResponse> {
  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[button-trigger] Webhook failed: ${resp.status} ${text}`);
    return NextResponse.json({ error: 'Webhook failed', detail: text }, { status: 502 });
  }
  return NextResponse.json({ message: 'Webhook triggered successfully' });
}
