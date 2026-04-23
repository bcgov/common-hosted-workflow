import { NextRequest, NextResponse } from 'next/server';
import { getPlaygroundDetail } from '@/lib/playground-resolve';
import type { PlaygroundExport } from '@/types/playground';

type RouteContext = { params: Promise<{ name: string }> };

/**
 * GET /api/playgrounds/[name]/export
 *
 * Returns the full playground configuration as a downloadable JSON object.
 * Includes credentials and form entries for import/export workflows.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { name } = await params;

  try {
    const detail = getPlaygroundDetail(name);

    if (!detail) {
      return NextResponse.json({ error: 'Playground not found' }, { status: 404 });
    }

    const exportData: PlaygroundExport = {
      n8nTarget: detail.n8nTarget,
      xN8nApiKey: detail.xN8nApiKey,
      tenantId: detail.tenantId,
      chefsBaseUrl: detail.chefsBaseUrl,
      forms: detail.forms,
    };

    return NextResponse.json(exportData);
  } catch (err) {
    console.error('Database error while exporting playground', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
