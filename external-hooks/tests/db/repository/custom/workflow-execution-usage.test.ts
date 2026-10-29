import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { WorkflowExecutionUsageRepository } from '../../../../src/db/repository/custom/workflow-execution-usage';
import { workflowExecutionUsage } from '../../../../src/db/schema/workflow-execution-usage';

describe('WorkflowExecutionUsageRepository', () => {
  let db: any;
  let repo: WorkflowExecutionUsageRepository;

  beforeEach(() => {
    db = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    repo = new WorkflowExecutionUsageRepository(db);
  });

  describe('increment', () => {
    it('inserts with count 1 when the row is missing (upsert-on-conflict shape)', async () => {
      await repo.increment('proj-123', 'wf-100', 'weekly', '2026-W44');

      expect(db.insert).toHaveBeenCalledWith(workflowExecutionUsage);
      expect(db.values).toHaveBeenCalledWith({
        projectId: 'proj-123',
        workflowId: 'wf-100',
        periodType: 'weekly',
        periodKey: '2026-W44',
        count: 1,
      });
      expect(db.onConflictDoUpdate).toHaveBeenCalledWith({
        target: [
          workflowExecutionUsage.projectId,
          workflowExecutionUsage.workflowId,
          workflowExecutionUsage.periodType,
          workflowExecutionUsage.periodKey,
        ],
        set: {
          count: sql`${workflowExecutionUsage.count} + 1`,
          updatedAt: sql`now()`,
        },
      });
    });

    it('uses the same atomic upsert shape for yearly periods', async () => {
      await repo.increment('proj-123', 'wf-100', 'yearly', '2026');

      expect(db.values).toHaveBeenCalledWith({
        projectId: 'proj-123',
        workflowId: 'wf-100',
        periodType: 'yearly',
        periodKey: '2026',
        count: 1,
      });
    });

    it('rejects an invalid period_type via the CHECK constraint', async () => {
      // Without a live database the CHECK lives in the table definition, so
      // assert the constraint exists with the whitelisted period values.
      const config = getTableConfig(workflowExecutionUsage);
      const check = config.checks.find((entry: { name: string }) => entry.name === 'chk_weu_period_type');
      expect(check).toBeDefined();
      const compiled = new PgDialect().sqlToQuery((check as unknown as { value: SQL }).value);
      expect(compiled.sql).toContain("'weekly'");
      expect(compiled.sql).toContain("'yearly'");
    });
  });

  describe('listCountsByWorkflowIds', () => {
    it('returns an empty Map without querying when no workflow ids are given', async () => {
      const result = await repo.listCountsByWorkflowIds('proj-123', [], '2026-W44', '2026');

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('aggregates rows into per-workflow weekly and yearly counts', async () => {
      db.where.mockResolvedValue([
        { workflowId: 'wf-100', periodType: 'weekly', count: 5 },
        { workflowId: 'wf-100', periodType: 'yearly', count: 50 },
        { workflowId: 'wf-200', periodType: 'weekly', count: 2 },
      ]);

      const result = await repo.listCountsByWorkflowIds('proj-123', ['wf-100', 'wf-200'], '2026-W44', '2026');

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(db.where).toHaveBeenCalledTimes(1);
      expect(result.get('wf-100')).toEqual({ weeklyCount: 5, yearlyCount: 50 });
      expect(result.get('wf-200')).toEqual({ weeklyCount: 2, yearlyCount: 0 });
    });

    it('zero-fills workflows without usage rows', async () => {
      db.where.mockResolvedValue([{ workflowId: 'wf-200', periodType: 'yearly', count: 3 }]);

      const result = await repo.listCountsByWorkflowIds('proj-123', ['wf-100', 'wf-200'], '2026-W44', '2026');

      expect(result.get('wf-100')).toEqual({ weeklyCount: 0, yearlyCount: 0 });
      expect(result.get('wf-200')).toEqual({ weeklyCount: 0, yearlyCount: 3 });
    });

    it('ignores usage rows for workflows outside the requested set', async () => {
      db.where.mockResolvedValue([{ workflowId: 'wf-999', periodType: 'weekly', count: 9 }]);

      const result = await repo.listCountsByWorkflowIds('proj-123', ['wf-100'], '2026-W44', '2026');

      expect(result.get('wf-100')).toEqual({ weeklyCount: 0, yearlyCount: 0 });
      expect(result.has('wf-999')).toBe(false);
    });
  });
});
