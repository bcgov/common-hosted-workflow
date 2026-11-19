import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { RateLimitRequestRepository } from '../../../../src/db/repository/custom/rate-limit-request';

describe('RateLimitRequestRepository approval fulfillment', () => {
  function setup(pending = true) {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const builder = drizzle.mock();
    const tx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(pending ? [{ id: 'request' }] : []) }),
        }),
      }),
      insert: vi.fn((table) => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: (config: any) => {
            queries.push(builder.insert(table).values(values).onConflictDoUpdate(config).toSQL());
            return Promise.resolve();
          },
        }),
      })),
    };
    const db = { transaction: vi.fn((callback) => callback(tx)) };
    return { repo: new RateLimitRequestRepository(db), queries, tx, db };
  }

  it.each([
    { weekly: 20_000, annual: null, preserved: 'yearly_rate_limit', changed: 'weekly_rate_limit' },
    { weekly: null, annual: 600_000, preserved: 'weekly_rate_limit', changed: 'yearly_rate_limit' },
  ])(
    'preserves the untouched $preserved and custom stop behavior in the conflict SQL',
    async ({ weekly, annual, preserved, changed }) => {
      const { repo, queries, db } = setup();
      await repo.approveAsLimitChange(
        'request',
        {
          decidedWeeklyLimit: weekly,
          decidedAnnualLimit: annual,
          decisionNote: null,
          decidedBy: 'admin',
        },
        { projectId: 'project', lastAdminComment: 'Approved' },
      );

      expect(db.transaction).toHaveBeenCalledOnce();
      const conflict = queries[0].sql.split('do update set ')[1];
      expect(conflict).toContain(
        `"${preserved}" = CASE WHEN "project_rate_limit"."uses_default_limits" THEN NULL ELSE "project_rate_limit"."${preserved}" END`,
      );
      expect(conflict).toContain(`"${changed}" = $`);
      expect(conflict).toContain(
        `"stop_behavior" = CASE WHEN "project_rate_limit"."uses_default_limits" THEN 'hard_stop' ELSE "project_rate_limit"."stop_behavior" END`,
      );
      expect(queries[0].params).toContain(weekly ?? annual);
    },
  );

  it('applies both explicit grants instead of preserving either period', async () => {
    const { repo, queries } = setup();
    await repo.approveAsLimitChange(
      'request',
      {
        decidedWeeklyLimit: 20_000,
        decidedAnnualLimit: 600_000,
        decisionNote: null,
        decidedBy: 'admin',
      },
      { projectId: 'project', lastAdminComment: null },
    );
    const conflict = queries[0].sql.split('do update set ')[1];
    expect(conflict).not.toContain('THEN NULL');
    expect(queries[0].params).toEqual(expect.arrayContaining([20_000, 600_000, false, 'hard_stop']));
  });

  it('does not change project limits when the pending decision loses a race', async () => {
    const { repo, tx } = setup(false);
    await expect(
      repo.approveAsLimitChange(
        'request',
        {
          decidedWeeklyLimit: 20_000,
          decidedAnnualLimit: null,
          decisionNote: null,
          decidedBy: 'admin',
        },
        { projectId: 'project', lastAdminComment: null },
      ),
    ).resolves.toBeNull();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
