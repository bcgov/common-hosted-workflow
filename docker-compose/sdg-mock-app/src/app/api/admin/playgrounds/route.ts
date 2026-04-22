import { NextResponse } from 'next/server';
import { listAllPlaygrounds, getPlaygroundForms } from '@/lib/playground-db';

/**
 * GET /api/admin/playgrounds
 *
 * Returns all playgrounds grouped by owner.
 * Response shape: { owners: [{ owner, playgrounds: [{ name, n8nTarget, formCount, createdAt, updatedAt }] }] }
 */
export async function GET() {
  try {
    const all = listAllPlaygrounds();

    const grouped = new Map<string, typeof all>();
    for (const pg of all) {
      const list = grouped.get(pg.owner) ?? [];
      list.push(pg);
      grouped.set(pg.owner, list);
    }

    const owners = [...grouped.entries()].map(([owner, playgrounds]) => ({
      owner,
      playgrounds: playgrounds.map((pg) => {
        const forms = getPlaygroundForms(pg.name);
        return {
          name: pg.name,
          n8nTarget: pg.n8n_target,
          tenantId: pg.x_tenant_id,
          chefsBaseUrl: pg.chefs_base_url,
          formCount: forms.length,
          createdAt: pg.created_at,
          updatedAt: pg.updated_at,
        };
      }),
    }));

    return NextResponse.json({ owners });
  } catch (err) {
    console.error('Database error in admin playgrounds', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
