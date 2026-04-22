import { NextRequest, NextResponse } from 'next/server';
import { createPlayground, playgroundExists } from '@/lib/playground-db';
import { validatePlaygroundName, validateImportPayload } from '@/lib/validation';
import type { PlaygroundExport } from '@/types/playground';

/**
 * POST /api/playgrounds/import
 *
 * Creates a new playground from an imported JSON payload.
 *
 * Request body: { name: string, owner: string, config: PlaygroundExport }
 * Returns 201 with { name } on success, 400 for validation errors, 409 for duplicates.
 */
export async function POST(request: NextRequest) {
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

  // Validate required field: name
  if (!Object.prototype.hasOwnProperty.call(data, 'name') || typeof data.name !== 'string') {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
  }

  const nameValidation = validatePlaygroundName(data.name);
  if (!nameValidation.valid) {
    return NextResponse.json({ error: `Invalid playground name: ${nameValidation.error}` }, { status: 400 });
  }

  // Validate required field: owner
  if (
    !Object.prototype.hasOwnProperty.call(data, 'owner') ||
    typeof data.owner !== 'string' ||
    data.owner.length === 0
  ) {
    return NextResponse.json({ error: 'Missing required field: owner' }, { status: 400 });
  }

  // Validate required field: config
  if (!Object.prototype.hasOwnProperty.call(data, 'config')) {
    return NextResponse.json({ error: 'Missing required field: config' }, { status: 400 });
  }

  const configValidation = validateImportPayload(data.config);
  if (!configValidation.valid) {
    return NextResponse.json({ error: `Invalid import payload: ${configValidation.error}` }, { status: 400 });
  }

  const config = data.config as PlaygroundExport;

  try {
    // Check for duplicate name
    if (playgroundExists(data.name)) {
      return NextResponse.json({ error: 'Playground name already exists for this owner' }, { status: 409 });
    }

    createPlayground({
      name: data.name,
      owner: data.owner,
      n8nTarget: config.n8nTarget,
      xN8nApiKey: config.xN8nApiKey,
      tenantId: config.tenantId,
      chefsBaseUrl: config.chefsBaseUrl,
      forms: config.forms,
    });

    return NextResponse.json({ name: data.name }, { status: 201 });
  } catch {
    console.error('Database error while importing playground');
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
