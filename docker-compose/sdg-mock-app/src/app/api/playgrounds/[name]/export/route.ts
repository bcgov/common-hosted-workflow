import { NextRequest, NextResponse } from 'next/server';
import { getPlayground, getPlaygroundForms } from '@/lib/playground-db';
import type { PlaygroundExport, FormEntry } from '@/types/playground';

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

    const exportData: PlaygroundExport = {
      n8nTarget: playground.n8n_target,
      xN8nApiKey: playground.x_n8n_api_key,
      tenantId: playground.x_tenant_id,
      chefsBaseUrl: playground.chefs_base_url,
      forms,
    };

    return NextResponse.json(exportData);
  } catch {
    console.error('Database error while exporting playground');
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
