'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.WorkflowExecutionUsageRepository = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const workflow_execution_usage_1 = require('../../schema/workflow-execution-usage');
class WorkflowExecutionUsageRepository {
  db;
  constructor(db) {
    this.db = db;
  }
  /**
   * Atomically increments the usage counter for a workflow within a project and
   * period. Inserts the row with count 1 when missing, otherwise adds 1 to the
   * existing count, so concurrent workers can never lose an increment.
   */
  async increment(projectId, workflowId, periodType, periodKey) {
    await this.db
      .insert(workflow_execution_usage_1.workflowExecutionUsage)
      .values({ projectId, workflowId, periodType, periodKey, count: 1 })
      .onConflictDoUpdate({
        target: [
          workflow_execution_usage_1.workflowExecutionUsage.projectId,
          workflow_execution_usage_1.workflowExecutionUsage.workflowId,
          workflow_execution_usage_1.workflowExecutionUsage.periodType,
          workflow_execution_usage_1.workflowExecutionUsage.periodKey,
        ],
        set: {
          count: (0, drizzle_orm_1.sql)`${workflow_execution_usage_1.workflowExecutionUsage.count} + 1`,
          updatedAt: (0, drizzle_orm_1.sql)`now()`,
        },
      });
  }
  /**
   * Returns the current weekly and yearly execution counts per workflow of a
   * project for the given period keys in a single query. Workflows without
   * matching rows report 0.
   */
  async listCountsByWorkflowIds(projectId, workflowIds, weeklyKey, yearlyKey) {
    const counts = new Map();
    for (const workflowId of workflowIds) {
      counts.set(workflowId, { weeklyCount: 0, yearlyCount: 0 });
    }
    if (!workflowIds.length) {
      return counts;
    }
    const rows = await this.db
      .select({
        workflowId: workflow_execution_usage_1.workflowExecutionUsage.workflowId,
        periodType: workflow_execution_usage_1.workflowExecutionUsage.periodType,
        count: workflow_execution_usage_1.workflowExecutionUsage.count,
      })
      .from(workflow_execution_usage_1.workflowExecutionUsage)
      .where(
        (0, drizzle_orm_1.and)(
          (0, drizzle_orm_1.eq)(workflow_execution_usage_1.workflowExecutionUsage.projectId, projectId),
          (0, drizzle_orm_1.inArray)(workflow_execution_usage_1.workflowExecutionUsage.workflowId, workflowIds),
          (0, drizzle_orm_1.or)(
            (0, drizzle_orm_1.and)(
              (0, drizzle_orm_1.eq)(workflow_execution_usage_1.workflowExecutionUsage.periodType, 'weekly'),
              (0, drizzle_orm_1.eq)(workflow_execution_usage_1.workflowExecutionUsage.periodKey, weeklyKey),
            ),
            (0, drizzle_orm_1.and)(
              (0, drizzle_orm_1.eq)(workflow_execution_usage_1.workflowExecutionUsage.periodType, 'yearly'),
              (0, drizzle_orm_1.eq)(workflow_execution_usage_1.workflowExecutionUsage.periodKey, yearlyKey),
            ),
          ),
        ),
      );
    for (const row of rows) {
      const entry = counts.get(row.workflowId);
      if (!entry) {
        continue;
      }
      if (row.periodType === 'weekly') {
        entry.weeklyCount = row.count;
      } else if (row.periodType === 'yearly') {
        entry.yearlyCount = row.count;
      }
    }
    return counts;
  }
}
exports.WorkflowExecutionUsageRepository = WorkflowExecutionUsageRepository;
