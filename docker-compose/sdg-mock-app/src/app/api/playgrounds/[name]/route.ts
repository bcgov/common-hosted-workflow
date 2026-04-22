import { NextRequest, NextResponse } from 'next/server';
import {
  getPlayground,
  getPlaygroundForms,
  updatePlayground,
  deletePlayground,
  playgroundExists,
} from '@/lib/playground-db';
import type { PlaygroundDetail, FormEntry } from '@/types/playground';

type RouteContext = { params: Promise<{ name: string }> };

/**
 * GET /api/playgrounds/[name]
 *
 * Returns the full playground detail including sensitive fields.
 * This is intended for the Configuration Page where the owner
 * needs to see and edit API keys and callback URLs.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { name } = await params;

  try {
    const playground = getPlayground(name);

    if (!playground) {
      return NextResponse.json({ error: 'Playground not found' }, { status: 404 });
    }

    const formRecords = getPlaygroundForms(name);

    const forms: FormEntry[] = formRecords.map((f) => ({
      formId: f.form_id,
      formName: f.form_name,
      apiKey: f.api_key,
      allowedActors: JSON.parse(f.allowed_actors) as string[],
      callbackWebhookUrl: f.callback_webhook_url,
    }));

    const detail: PlaygroundDetail = {
      name: playground.name,
      owner: playground.owner,
      n8nTarget: playground.n8n_target,
      xN8nApiKey: playground.x_n8n_api_key,
      tenantId: playground.x_tenant_id,
      chefsBaseUrl: playground.chefs_base_url,
      forms,
      createdAt: playground.created_at,
      updatedAt: playground.updated_at,
    };

    return NextResponse.json(detail);
  } catch {
    console.error('Database error while fetching playground');
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

/**
 * PUT /api/playgrounds/[name]
 *
 * Updates an existing playground's configuration.
 * Replaces the form entries array entirely (not a partial merge).
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
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

  try {
    if (!playgroundExists(name)) {
      return NextResponse.json({ error: 'Playground not found' }, { status: 404 });
    }

    const data = body as Record<string, unknown>;

    updatePlayground(name, {
      n8nTarget: typeof data.n8nTarget === 'string' ? data.n8nTarget : undefined,
      xN8nApiKey: typeof data.xN8nApiKey === 'string' ? data.xN8nApiKey : undefined, // pragma: allowlist secret
      tenantId: typeof data.tenantId === 'string' ? data.tenantId : undefined,
      chefsBaseUrl: typeof data.chefsBaseUrl === 'string' ? data.chefsBaseUrl : undefined,
      forms: Array.isArray(data.forms)
        ? (data.forms as Array<{
            formId: string;
            formName: string;
            apiKey: string;
            allowedActors: string[];
            callbackWebhookUrl: string;
          }>)
        : undefined,
    });

    return NextResponse.json({ name });
  } catch {
    console.error('Database error while updating playground');
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

/**
 * DELETE /api/playgrounds/[name]
 *
 * Deletes a playground and its form entries (cascade).
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { name } = await params;

  try {
    if (!playgroundExists(name)) {
      return NextResponse.json({ error: 'Playground not found' }, { status: 404 });
    }

    deletePlayground(name);

    return NextResponse.json({ deleted: true });
  } catch {
    console.error('Database error while deleting playground');
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
