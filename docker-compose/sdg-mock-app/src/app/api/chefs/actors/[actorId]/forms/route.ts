import { NextRequest, NextResponse } from 'next/server';
import { loadChefsConfig } from '@/lib/chefs-config';
import { resolvePlaygroundForms } from '@/lib/playground-resolve';

/**
 * GET /api/chefs/actors/{actorId}/forms
 *
 * Returns the list of CHEFS forms the given actor is allowed to access.
 * Secrets (apiKey) are never exposed — only formId and formName.
 *
 * When the X-PLAYGROUND-ID header is present, forms are resolved from
 * the playground database instead of chefs-config.json.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ actorId: string }> }) {
  const { actorId } = await params;
  const playgroundName = request.headers.get('x-playground-id') ?? null;

  if (playgroundName !== null) {
    // ── Playground mode: resolve forms from the database ──
    const resolvedForms = resolvePlaygroundForms(playgroundName);
    if (resolvedForms === null) {
      return NextResponse.json({ error: 'Playground not found' }, { status: 404 });
    }

    const forms = resolvedForms
      .filter((f) => f.allowedActors.includes('*') || f.allowedActors.includes(actorId))
      .map(({ formId, formName }) => ({ formId, formName }));

    return NextResponse.json({ forms });
  }

  // ── Legacy mode: resolve forms from chefs-config.json ──
  const chefsConfig = loadChefsConfig();
  const forms = chefsConfig.forms
    .filter((f) => f.allowedActors.includes('*') || f.allowedActors.includes(actorId))
    .map(({ formId, formName }) => ({ formId, formName }));

  return NextResponse.json({ forms });
}
