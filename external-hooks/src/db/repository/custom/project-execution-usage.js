'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ProjectExecutionUsageRepository = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const project_execution_usage_1 = require('../../schema/project-execution-usage');
class ProjectExecutionUsageRepository {
  db;
  constructor(db) {
    this.db = db;
  }
  /**
   * Returns the current weekly and yearly execution counts for a project in a single query.
   * Missing period rows count as 0.
   */
  async getCounts(projectId, weeklyKey, yearlyKey) {
    const rows = await this.db
      .select({
        periodType: project_execution_usage_1.projectExecutionUsage.periodType,
        count: project_execution_usage_1.projectExecutionUsage.count,
      })
      .from(project_execution_usage_1.projectExecutionUsage)
      .where(
        (0, drizzle_orm_1.and)(
          (0, drizzle_orm_1.eq)(project_execution_usage_1.projectExecutionUsage.projectId, projectId),
          (0, drizzle_orm_1.or)(
            (0, drizzle_orm_1.and)(
              (0, drizzle_orm_1.eq)(project_execution_usage_1.projectExecutionUsage.periodType, 'weekly'),
              (0, drizzle_orm_1.eq)(project_execution_usage_1.projectExecutionUsage.periodKey, weeklyKey),
            ),
            (0, drizzle_orm_1.and)(
              (0, drizzle_orm_1.eq)(project_execution_usage_1.projectExecutionUsage.periodType, 'yearly'),
              (0, drizzle_orm_1.eq)(project_execution_usage_1.projectExecutionUsage.periodKey, yearlyKey),
            ),
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
  async increment(projectId, periodType, periodKey) {
    await this.db
      .insert(project_execution_usage_1.projectExecutionUsage)
      .values({ projectId, periodType, periodKey, count: 1 })
      .onConflictDoUpdate({
        target: [
          project_execution_usage_1.projectExecutionUsage.projectId,
          project_execution_usage_1.projectExecutionUsage.periodType,
          project_execution_usage_1.projectExecutionUsage.periodKey,
        ],
        set: {
          count: (0, drizzle_orm_1.sql)`${project_execution_usage_1.projectExecutionUsage.count} + 1`,
          updatedAt: (0, drizzle_orm_1.sql)`now()`,
        },
      });
  }
  /**
   * Returns the current weekly and yearly execution counts per project for the given
   * period keys in a single query. Projects without matching rows report 0.
   */
  async listCountsByProjectIds(projectIds, weeklyKey, yearlyKey) {
    if (!projectIds.length) {
      return new Map();
    }
    const rows = await this.db
      .select({
        projectId: project_execution_usage_1.projectExecutionUsage.projectId,
        periodType: project_execution_usage_1.projectExecutionUsage.periodType,
        count: project_execution_usage_1.projectExecutionUsage.count,
      })
      .from(project_execution_usage_1.projectExecutionUsage)
      .where(
        (0, drizzle_orm_1.and)(
          (0, drizzle_orm_1.inArray)(project_execution_usage_1.projectExecutionUsage.projectId, projectIds),
          (0, drizzle_orm_1.or)(
            (0, drizzle_orm_1.and)(
              (0, drizzle_orm_1.eq)(project_execution_usage_1.projectExecutionUsage.periodType, 'weekly'),
              (0, drizzle_orm_1.eq)(project_execution_usage_1.projectExecutionUsage.periodKey, weeklyKey),
            ),
            (0, drizzle_orm_1.and)(
              (0, drizzle_orm_1.eq)(project_execution_usage_1.projectExecutionUsage.periodType, 'yearly'),
              (0, drizzle_orm_1.eq)(project_execution_usage_1.projectExecutionUsage.periodKey, yearlyKey),
            ),
          ),
        ),
      );
    const counts = new Map();
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
exports.ProjectExecutionUsageRepository = ProjectExecutionUsageRepository;
