'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const drizzle_orm_1 = require('drizzle-orm');
const pg_core_1 = require('drizzle-orm/pg-core');
const workflow_execution_usage_1 = require('../../../../src/db/repository/custom/workflow-execution-usage');
const workflow_execution_usage_2 = require('../../../../src/db/schema/workflow-execution-usage');
(0, vitest_1.describe)('WorkflowExecutionUsageRepository', () => {
  let db;
  let repo;
  (0, vitest_1.beforeEach)(() => {
    db = {
      select: vitest_1.vi.fn().mockReturnThis(),
      insert: vitest_1.vi.fn().mockReturnThis(),
      from: vitest_1.vi.fn().mockReturnThis(),
      where: vitest_1.vi.fn().mockResolvedValue([]),
      values: vitest_1.vi.fn().mockReturnThis(),
      onConflictDoUpdate: vitest_1.vi.fn().mockResolvedValue(undefined),
    };
    repo = new workflow_execution_usage_1.WorkflowExecutionUsageRepository(db);
  });
  (0, vitest_1.describe)('increment', () => {
    (0, vitest_1.it)('inserts with count 1 when the row is missing (upsert-on-conflict shape)', async () => {
      await repo.increment('proj-123', 'wf-100', 'weekly', '2026-W44');
      (0, vitest_1.expect)(db.insert).toHaveBeenCalledWith(workflow_execution_usage_2.workflowExecutionUsage);
      (0, vitest_1.expect)(db.values).toHaveBeenCalledWith({
        projectId: 'proj-123',
        workflowId: 'wf-100',
        periodType: 'weekly',
        periodKey: '2026-W44',
        count: 1,
      });
      (0, vitest_1.expect)(db.onConflictDoUpdate).toHaveBeenCalledWith({
        target: [
          workflow_execution_usage_2.workflowExecutionUsage.projectId,
          workflow_execution_usage_2.workflowExecutionUsage.workflowId,
          workflow_execution_usage_2.workflowExecutionUsage.periodType,
          workflow_execution_usage_2.workflowExecutionUsage.periodKey,
        ],
        set: {
          count: (0, drizzle_orm_1.sql)`${workflow_execution_usage_2.workflowExecutionUsage.count} + 1`,
          updatedAt: (0, drizzle_orm_1.sql)`now()`,
        },
      });
    });
    (0, vitest_1.it)('uses the same atomic upsert shape for yearly periods', async () => {
      await repo.increment('proj-123', 'wf-100', 'yearly', '2026');
      (0, vitest_1.expect)(db.values).toHaveBeenCalledWith({
        projectId: 'proj-123',
        workflowId: 'wf-100',
        periodType: 'yearly',
        periodKey: '2026',
        count: 1,
      });
    });
    (0, vitest_1.it)('rejects an invalid period_type via the CHECK constraint', async () => {
      // Without a live database the CHECK lives in the table definition, so
      // assert the constraint exists with the whitelisted period values.
      const config = (0, pg_core_1.getTableConfig)(workflow_execution_usage_2.workflowExecutionUsage);
      const check = config.checks.find((entry) => entry.name === 'chk_weu_period_type');
      (0, vitest_1.expect)(check).toBeDefined();
      const compiled = new pg_core_1.PgDialect().sqlToQuery(check.value);
      (0, vitest_1.expect)(compiled.sql).toContain("'weekly'");
      (0, vitest_1.expect)(compiled.sql).toContain("'yearly'");
    });
  });
  (0, vitest_1.describe)('listCountsByWorkflowIds', () => {
    (0, vitest_1.it)('returns an empty Map without querying when no workflow ids are given', async () => {
      const result = await repo.listCountsByWorkflowIds('proj-123', [], '2026-W44', '2026');
      (0, vitest_1.expect)(result).toBeInstanceOf(Map);
      (0, vitest_1.expect)(result.size).toBe(0);
      (0, vitest_1.expect)(db.select).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('aggregates rows into per-workflow weekly and yearly counts', async () => {
      db.where.mockResolvedValue([
        { workflowId: 'wf-100', periodType: 'weekly', count: 5 },
        { workflowId: 'wf-100', periodType: 'yearly', count: 50 },
        { workflowId: 'wf-200', periodType: 'weekly', count: 2 },
      ]);
      const result = await repo.listCountsByWorkflowIds('proj-123', ['wf-100', 'wf-200'], '2026-W44', '2026');
      (0, vitest_1.expect)(db.select).toHaveBeenCalledTimes(1);
      (0, vitest_1.expect)(db.where).toHaveBeenCalledTimes(1);
      (0, vitest_1.expect)(result.get('wf-100')).toEqual({ weeklyCount: 5, yearlyCount: 50 });
      (0, vitest_1.expect)(result.get('wf-200')).toEqual({ weeklyCount: 2, yearlyCount: 0 });
    });
    (0, vitest_1.it)('zero-fills workflows without usage rows', async () => {
      db.where.mockResolvedValue([{ workflowId: 'wf-200', periodType: 'yearly', count: 3 }]);
      const result = await repo.listCountsByWorkflowIds('proj-123', ['wf-100', 'wf-200'], '2026-W44', '2026');
      (0, vitest_1.expect)(result.get('wf-100')).toEqual({ weeklyCount: 0, yearlyCount: 0 });
      (0, vitest_1.expect)(result.get('wf-200')).toEqual({ weeklyCount: 0, yearlyCount: 3 });
    });
    (0, vitest_1.it)('ignores usage rows for workflows outside the requested set', async () => {
      db.where.mockResolvedValue([{ workflowId: 'wf-999', periodType: 'weekly', count: 9 }]);
      const result = await repo.listCountsByWorkflowIds('proj-123', ['wf-100'], '2026-W44', '2026');
      (0, vitest_1.expect)(result.get('wf-100')).toEqual({ weeklyCount: 0, yearlyCount: 0 });
      (0, vitest_1.expect)(result.has('wf-999')).toBe(false);
    });
  });
});
