import { NextRequest, NextResponse } from 'next/server';
import {
  listPlaygrounds,
  getPlaygroundForms,
  createPlayground,
  playgroundExists,
  type CreatePlaygroundInput,
} from '@/lib/playground-db';
import { validatePlaygroundName } from '@/lib/validation';
import { parseJsonObjectBody, requireStringField } from '@/lib/http';
import type { PlaygroundSummary } from '@/types/playground';

/**
 * GET /api/playgrounds?owner=<tester_name>
 *
 * Lists playgrounds owned by the specified tester.
 * Strips sensitive fields (xN8nApiKey, form apiKey, callbackWebhookUrl)
 * and returns PlaygroundSummary[] with formCount.
 */
export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get('owner');

  if (!owner) {
    return NextResponse.json({ error: 'Missing required query parameter: owner' }, { status: 400 });
  }

  try {
    const playgrounds = listPlaygrounds(owner);

    const summaries: PlaygroundSummary[] = playgrounds.map((pg) => {
      const forms = getPlaygroundForms(pg.name);
      return {
        name: pg.name,
        owner: pg.owner,
        n8nTarget: pg.n8n_target,
        chefsBaseUrl: pg.chefs_base_url,
        tenantId: pg.x_tenant_id,
        formCount: forms.length,
        createdAt: pg.created_at,
        updatedAt: pg.updated_at,
      };
    });

    return NextResponse.json({ playgrounds: summaries });
  } catch (err) {
    console.error('Database error while listing playgrounds', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

/**
 * POST /api/playgrounds
 *
 * Creates a new playground. Validates the name server-side and checks
 * for duplicates before inserting into the database.
 *
 * Request body: { name, owner, n8nTarget?, xN8nApiKey?, tenantId?, chefsBaseUrl?, forms? }
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

  try {
    // Check for duplicate name
    if (playgroundExists(nameField.value)) {
      return NextResponse.json({ error: 'Playground name already exists for this owner' }, { status: 409 });
    }

    createPlayground({
      name: nameField.value,
      owner: ownerField.value,
      n8nTarget: typeof data.n8nTarget === 'string' ? data.n8nTarget : undefined,
      xN8nApiKey: typeof data.xN8nApiKey === 'string' ? data.xN8nApiKey : undefined, // pragma: allowlist secret
      tenantId: typeof data.tenantId === 'string' ? data.tenantId : undefined,
      chefsBaseUrl: typeof data.chefsBaseUrl === 'string' ? data.chefsBaseUrl : undefined,
      forms: Array.isArray(data.forms) ? (data.forms as CreatePlaygroundInput['forms']) : undefined,
    });

    return NextResponse.json({ name: nameField.value }, { status: 201 });
  } catch (err) {
    console.error('Database error while creating playground', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
