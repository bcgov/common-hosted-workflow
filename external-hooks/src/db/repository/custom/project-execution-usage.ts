import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { projectExecutionUsage } from '../../schema/project-execution-usage';

export class ProjectExecutionUsageRepository {
  constructor(private readonly db: any) {}

  /**
   * Returns the current weekly and yearly execution counts for a project in a single query.
   * Missing period rows count as 0.
   */
  async getCounts(
    projectId: string,
    weeklyKey: string,
    yearlyKey: string,
  ): Promise<{ weeklyCount: number; yearlyCount: number }> {
    const rows: Array<{ periodType: string; count: number }> = await this.db
      .select({ periodType: projectExecutionUsage.periodType, count: projectExecutionUsage.count })
      .from(projectExecutionUsage)
      .where(
        and(
          eq(projectExecutionUsage.projectId, projectId),
          or(
            and(eq(projectExecutionUsage.periodType, 'weekly'), eq(projectExecutionUsage.periodKey, weeklyKey)),
            and(eq(projectExecutionUsage.periodType, 'yearly'), eq(projectExecutionUsage.periodKey, yearlyKey)),
          ),
        ),
      );

    const counts = { weeklyCount: 0, yearlyCount: 0 };
    for (const row of rows) {
      if (row.periodType === 'weekly') {
        counts.weeklyCount = row.count;
      } else if (row.periodType === 'yearly') {
        counts.yearlyCount = row.count;
      }
    }
    return counts;
  }

  /**
   * Atomically increments the usage counter for a project and period. Inserts the row
   * with count 1 when missing, otherwise adds 1 to the existing count, so concurrent
   * workers can never lose an increment.
   */
  async increment(projectId: string, periodType: string, periodKey: string): Promise<void> {
    await this.db
      .insert(projectExecutionUsage)
      .values({ projectId, periodType, periodKey, count: 1 })
      .onConflictDoUpdate({
        target: [projectExecutionUsage.projectId, projectExecutionUsage.periodType, projectExecutionUsage.periodKey],
        set: {
          count: sql`${projectExecutionUsage.count} + 1`,
          updatedAt: sql`now()`,
        },
      });
  }

  /**
   * Returns the current weekly and yearly execution counts per project for the given
   * period keys in a single query. Projects without matching rows report 0.
   */
  async listCountsByProjectIds(
    projectIds: string[],
    weeklyKey: string,
    yearlyKey: string,
  ): Promise<Map<string, { weeklyCount: number; yearlyCount: number }>> {
    if (!projectIds.length) {
      return new Map();
    }

    const rows: Array<{ projectId: string; periodType: string; count: number }> = await this.db
      .select({
        projectId: projectExecutionUsage.projectId,
        periodType: projectExecutionUsage.periodType,
        count: projectExecutionUsage.count,
      })
      .from(projectExecutionUsage)
      .where(
        and(
          inArray(projectExecutionUsage.projectId, projectIds),
          or(
            and(eq(projectExecutionUsage.periodType, 'weekly'), eq(projectExecutionUsage.periodKey, weeklyKey)),
            and(eq(projectExecutionUsage.periodType, 'yearly'), eq(projectExecutionUsage.periodKey, yearlyKey)),
          ),
        ),
      );

    const counts = new Map<string, { weeklyCount: number; yearlyCount: number }>();
    for (const projectId of projectIds) {
      counts.set(projectId, { weeklyCount: 0, yearlyCount: 0 });
    }
    for (const row of rows) {
      const entry = counts.get(row.projectId) ?? { weeklyCount: 0, yearlyCount: 0 };
      if (row.periodType === 'weekly') {
        entry.weeklyCount = row.count;
      } else if (row.periodType === 'yearly') {
        entry.yearlyCount = row.count;
      }
      counts.set(row.projectId, entry);
    }
    return counts;
  }
}
