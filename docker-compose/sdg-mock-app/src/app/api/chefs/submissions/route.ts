import { NextRequest, NextResponse } from 'next/server';
import { resolvePlaygroundConfig, resolvePlaygroundForms } from '@/lib/playground-resolve';

/**
 * POST /api/chefs/submissions
 *
 * Receives { formId, submission, actorId } from the frontend after a CHEFS
 * form is submitted. If the form has a callbackWebhookUrl configured,
 * forwards the submission data to that webhook (typically an n8n endpoint).
 *
 * The X-PLAYGROUND-ID header is required. Form configuration and n8nTarget
 * are resolved from the playground database.
 */
export async function POST(request: NextRequest) {
  const { formId, submission, actorId } = await request.json();
  const playgroundName = request.headers.get('x-playground-id');

  if (!formId) {
    return NextResponse.json({ error: 'formId is required' }, { status: 400 });
  }

  if (!playgroundName) {
    return NextResponse.json({ error: 'X-PLAYGROUND-ID header is required' }, { status: 400 });
  }

  const resolvedForms = resolvePlaygroundForms(playgroundName);
  if (resolvedForms === null) {
    return NextResponse.json({ error: 'Playground not found' }, { status: 404 });
  }

  const entry = resolvedForms.find((f) => f.formId === formId);
  if (!entry) {
    return NextResponse.json({ error: 'Form not found in configuration' }, { status: 404 });
  }

  const callbackWebhookUrl = entry.callbackWebhookUrl;

  const pgConfig = resolvePlaygroundConfig(playgroundName);
  const n8nTarget = (pgConfig?.n8nTarget || '').replace(/\/+$/, '');

  if (!callbackWebhookUrl?.trim()) {
    return NextResponse.json({ message: 'Submission received, no callback configured' });
  }

  // Rewrite localhost:5678 URLs to the internal Docker hostname (same as wil-proxy)
  const callbackUrl = callbackWebhookUrl.replace(/^https?:\/\/localhost:5678/, n8nTarget);

  // Forward to the configured webhook
  const resp = await fetch(callbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formId, submission, actorId }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[chefs-submissions] Webhook failed: ${resp.status} ${text}`);
    return NextResponse.json({ error: 'Callback webhook failed', detail: text }, { status: 502 });
  }

  return NextResponse.json({ message: 'Submission forwarded to callback' });
}
