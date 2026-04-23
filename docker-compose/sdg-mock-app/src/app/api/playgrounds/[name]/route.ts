import { NextRequest, NextResponse } from 'next/server';
import { updatePlayground, deletePlayground, playgroundExists, type FormEntryInput } from '@/lib/playground-db';
import { getPlaygroundDetail } from '@/lib/playground-resolve';

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
    const detail = getPlaygroundDetail(name);

    if (!detail) {
      return NextResponse.json({ error: 'Playground not found' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (err) {
    console.error('Database error while fetching playground', err);
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
      forms: Array.isArray(data.forms) ? (data.forms as FormEntryInput[]) : undefined,
    });

    return NextResponse.json({ name });
  } catch (err) {
    console.error('Database error while updating playground', err);
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
  } catch (err) {
    console.error('Database error while deleting playground', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
