import { NextRequest, NextResponse } from 'next/server';
import { getPlayground, getPlaygroundForms, createPlayground, playgroundExists } from '@/lib/playground-db';
import { validatePlaygroundName } from '@/lib/validation';
import type { FormEntry } from '@/types/playground';

type RouteContext = { params: Promise<{ name: string }> };

/**
 * POST /api/playgrounds/[name]/clone
 *
 * Deep-copies a playground under a new name.
 *
 * Request body: { newName: string, owner: string }
 * Returns 201 with { name: newName } on success.
 * Returns 404 if the source playground does not exist.
 * Returns 409 if the target name already exists.
 * Returns 400 for validation errors.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { name } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
  }

  const data = body as Record<string, unknown>;

  // Validate required field: newName
  if (!Object.hasOwn(data, 'newName') || typeof data.newName !== 'string') {
    return NextResponse.json({ error: 'Missing required field: newName' }, { status: 400 });
  }

  const nameValidation = validatePlaygroundName(data.newName);
  if (!nameValidation.valid) {
    return NextResponse.json({ error: `Invalid playground name: ${nameValidation.error}` }, { status: 400 });
  }

  // Validate required field: owner
  if (!Object.hasOwn(data, 'owner') || typeof data.owner !== 'string' || data.owner.length === 0) {
    return NextResponse.json({ error: 'Missing required field: owner' }, { status: 400 });
  }

  try {
    // Check source playground exists
    const source = getPlayground(name);
    if (!source) {
      return NextResponse.json({ error: 'Source playground not found' }, { status: 404 });
    }

    // Check target name doesn't already exist
    if (playgroundExists(data.newName)) {
      return NextResponse.json({ error: 'Target name already exists' }, { status: 409 });
    }

    // Read source forms for deep copy
    const sourceFormRecords = getPlaygroundForms(name);
    const forms: FormEntry[] = sourceFormRecords.map((f) => ({
      formId: f.form_id,
      formName: f.form_name,
      apiKey: f.api_key,
      allowedActors: JSON.parse(f.allowed_actors) as string[],
      callbackWebhookUrl: f.callback_webhook_url,
    }));

    // Create the cloned playground with deep-copied config
    createPlayground({
      name: data.newName,
      owner: data.owner,
      n8nTarget: source.n8n_target,
      xN8nApiKey: source.x_n8n_api_key,
      tenantId: source.x_tenant_id,
      chefsBaseUrl: source.chefs_base_url,
      forms,
    });

    return NextResponse.json({ name: data.newName }, { status: 201 });
  } catch (err) {
    console.error('Database error while cloning playground', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
