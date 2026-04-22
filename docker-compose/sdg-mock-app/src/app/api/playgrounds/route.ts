import { NextRequest, NextResponse } from 'next/server';
import {
  listPlaygrounds,
  getPlaygroundForms,
  createPlayground,
  playgroundExists,
  type CreatePlaygroundInput,
} from '@/lib/playground-db';
import { validatePlaygroundName } from '@/lib/validation';
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

  try {
    // Check for duplicate name
    if (playgroundExists(data.name)) {
      return NextResponse.json({ error: 'Playground name already exists for this owner' }, { status: 409 });
    }

    createPlayground({
      name: data.name,
      owner: data.owner,
      n8nTarget: typeof data.n8nTarget === 'string' ? data.n8nTarget : undefined,
      xN8nApiKey: typeof data.xN8nApiKey === 'string' ? data.xN8nApiKey : undefined, // pragma: allowlist secret
      tenantId: typeof data.tenantId === 'string' ? data.tenantId : undefined,
      chefsBaseUrl: typeof data.chefsBaseUrl === 'string' ? data.chefsBaseUrl : undefined,
      forms: Array.isArray(data.forms) ? (data.forms as CreatePlaygroundInput['forms']) : undefined,
    });

    return NextResponse.json({ name: data.name }, { status: 201 });
  } catch (err) {
    console.error('Database error while creating playground', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
