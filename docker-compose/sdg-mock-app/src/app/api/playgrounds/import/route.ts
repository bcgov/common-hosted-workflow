import { NextRequest, NextResponse } from 'next/server';
import { createPlayground, playgroundExists } from '@/lib/playground-db';
import { validatePlaygroundName, validateImportPayload } from '@/lib/validation';
import { parseJsonObjectBody, requireStringField } from '@/lib/http';
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
  const parsed = await parseJsonObjectBody(request);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;

  // Validate required field: name
  const nameField = requireStringField(data, 'name');
  if (!nameField.ok) return nameField.response;

  const nameValidation = validatePlaygroundName(nameField.value);
  if (!nameValidation.valid) {
    return NextResponse.json({ error: `Invalid playground name: ${nameValidation.error}` }, { status: 400 });
  }

  // Validate required field: owner
  const ownerField = requireStringField(data, 'owner');
  if (!ownerField.ok) return ownerField.response;

  // Validate required field: config
  if (!Object.hasOwn(data, 'config')) {
    return NextResponse.json({ error: 'Missing required field: config' }, { status: 400 });
  }

  const configValidation = validateImportPayload(data.config);
  if (!configValidation.valid) {
    return NextResponse.json({ error: `Invalid import payload: ${configValidation.error}` }, { status: 400 });
  }

  const config = data.config as PlaygroundExport;

  try {
    // Check for duplicate name
    if (playgroundExists(nameField.value)) {
      return NextResponse.json({ error: 'Playground name already exists for this owner' }, { status: 409 });
    }

    createPlayground({
      name: nameField.value,
      owner: ownerField.value,
      n8nTarget: config.n8nTarget,
      xN8nApiKey: config.xN8nApiKey,
      tenantId: config.tenantId,
      chefsBaseUrl: config.chefsBaseUrl,
      forms: config.forms,
    });

    return NextResponse.json({ name: nameField.value }, { status: 201 });
  } catch (err) {
    console.error('Database error while importing playground', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
