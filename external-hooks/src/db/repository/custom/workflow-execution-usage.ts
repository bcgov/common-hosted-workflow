import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { workflowExecutionUsage } from '../../schema/workflow-execution-usage';

export class WorkflowExecutionUsageRepository {
  constructor(private readonly db: any) {}

  /**
   * Atomically increments the usage counter for a workflow within a project and
   * period. Inserts the row with count 1 when missing, otherwise adds 1 to the
   * existing count, so concurrent workers can never lose an increment.
   */
  async increment(projectId: string, workflowId: string, periodType: string, periodKey: string): Promise<void> {
    await this.db
      .insert(workflowExecutionUsage)
      .values({ projectId, workflowId, periodType, periodKey, count: 1 })
      .onConflictDoUpdate({
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
  }

  /**
   * Returns the current weekly and yearly execution counts per workflow of a
   * project for the given period keys in a single query. Workflows without
   * matching rows report 0.
   */
  async listCountsByWorkflowIds(
    projectId: string,
    workflowIds: string[],
    weeklyKey: string,
    yearlyKey: string,
  ): Promise<Map<string, { weeklyCount: number; yearlyCount: number }>> {
    const counts = new Map<string, { weeklyCount: number; yearlyCount: number }>();
    for (const workflowId of workflowIds) {
      counts.set(workflowId, { weeklyCount: 0, yearlyCount: 0 });
    }
    if (!workflowIds.length) {
      return counts;
    }

    const rows: Array<{ workflowId: string; periodType: string; count: number }> = await this.db
      .select({
        workflowId: workflowExecutionUsage.workflowId,
        periodType: workflowExecutionUsage.periodType,
        count: workflowExecutionUsage.count,
      })
      .from(workflowExecutionUsage)
      .where(
        and(
          eq(workflowExecutionUsage.projectId, projectId),
          inArray(workflowExecutionUsage.workflowId, workflowIds),
          or(
            and(eq(workflowExecutionUsage.periodType, 'weekly'), eq(workflowExecutionUsage.periodKey, weeklyKey)),
            and(eq(workflowExecutionUsage.periodType, 'yearly'), eq(workflowExecutionUsage.periodKey, yearlyKey)),
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
