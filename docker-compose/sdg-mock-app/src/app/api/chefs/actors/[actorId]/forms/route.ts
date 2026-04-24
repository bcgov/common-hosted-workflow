import { NextRequest, NextResponse } from 'next/server';
import { resolvePlaygroundForms } from '@/lib/playground-resolve';

/**
 * GET /api/chefs/actors/{actorId}/forms
 *
 * Returns the list of CHEFS forms the given actor is allowed to access.
 * Secrets (apiKey) are never exposed — only formId and formName.
 *
 * The X-PLAYGROUND-ID header is required. Forms are resolved from the
 * playground database.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ actorId: string }> }) {
  const { actorId } = await params;
  const playgroundName = request.headers.get('x-playground-id');

  if (!playgroundName) {
    return NextResponse.json({ error: 'X-PLAYGROUND-ID header is required' }, { status: 400 });
  }

  const resolvedForms = resolvePlaygroundForms(playgroundName);
  if (resolvedForms === null) {
    return NextResponse.json({ error: 'Playground not found' }, { status: 404 });
  }

  const forms = resolvedForms
    .filter((f) => f.allowedActors.includes('*') || f.allowedActors.includes(actorId))
    .map(({ formId, formName }) => ({ formId, formName }));

  return NextResponse.json({ forms });
}
