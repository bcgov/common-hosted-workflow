import { NextRequest, NextResponse } from 'next/server';
import chefsConfig from '../../../chefs-config.json';

/**
 * GET /api/chefs/actors/{actorId}/forms
 *
 * Returns the list of CHEFS forms the given actor is allowed to access.
 * Secrets (apiKey) are never exposed — only formId and formName.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ actorId: string }> }) {
  const { actorId } = await params;

  const forms = chefsConfig.forms
    .filter((f) => f.allowedActors.includes('*') || f.allowedActors.includes(actorId))
    .map(({ formId, formName }) => ({ formId, formName }));

  return NextResponse.json({ forms });
}
