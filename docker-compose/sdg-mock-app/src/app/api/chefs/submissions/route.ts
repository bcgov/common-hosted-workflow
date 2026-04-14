import { NextRequest, NextResponse } from 'next/server';
import chefsConfig from '../chefs-config.json';

/**
 * POST /api/chefs/submissions
 *
 * Receives { formId, submission } from the frontend after a CHEFS form is
 * submitted. If the form has a callbackWebhookUrl configured, forwards the
 * submission data to that webhook (typically an n8n webhook endpoint).
 */
export async function POST(request: NextRequest) {
  const { formId, submission, actorId } = await request.json();

  if (!formId) {
    return NextResponse.json({ error: 'formId is required' }, { status: 400 });
  }

  const entry = chefsConfig.forms.find((f) => f.formId === formId);
  if (!entry) {
    return NextResponse.json({ error: 'Form not found in configuration' }, { status: 404 });
  }

  if (!entry.callbackWebhookUrl?.trim()) {
    return NextResponse.json({ message: 'Submission received, no callback configured' });
  }

  // Rewrite localhost:5678 URLs to the internal Docker hostname (same as wil-proxy)
  const n8nTarget = (process.env.N8N_TARGET || 'http://localhost:5678').replace(/\/+$/, '');
  const callbackUrl = entry.callbackWebhookUrl.replace(/^https?:\/\/localhost:5678/, n8nTarget);

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
