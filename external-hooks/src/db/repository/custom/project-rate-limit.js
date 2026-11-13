'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ProjectRateLimitRepository = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const project_rate_limit_1 = require('../../schema/project-rate-limit');
class ProjectRateLimitRepository {
  db;
  constructor(db) {
    this.db = db;
  }
  /** Returns the rate-limit configuration row for a project, or null when the project is unconfigured. */
  async get(projectId) {
    const [row] = await this.db
      .select()
      .from(project_rate_limit_1.projectRateLimit)
      .where((0, drizzle_orm_1.eq)(project_rate_limit_1.projectRateLimit.projectId, projectId))
      .limit(1);
    return row ?? null;
  }
  /**
   * Upserts the rate-limit configuration for a project. Uses the primary key on project_id for conflict resolution.
   */
  async upsert(params) {
    await this.db
      .insert(project_rate_limit_1.projectRateLimit)
      .values(params)
      .onConflictDoUpdate({
        target: project_rate_limit_1.projectRateLimit.projectId,
        set: {
          usesDefaultLimits: params.usesDefaultLimits,
          weeklyRateLimit: params.weeklyRateLimit,
          yearlyRateLimit: params.yearlyRateLimit,
          lastAdminComment: params.lastAdminComment,
          stopBehavior: params.stopBehavior,
          updatedBy: params.updatedBy,
          updatedAt: (0, drizzle_orm_1.sql)`now()`,
        },
      });
  }
  /** Returns rate-limit configuration rows for the given projects as a map of projectId → row. */
  async listByProjectIds(projectIds) {
    if (!projectIds.length) {
      return new Map();
    }
    const rows = await this.db
      .select()
      .from(project_rate_limit_1.projectRateLimit)
      .where((0, drizzle_orm_1.inArray)(project_rate_limit_1.projectRateLimit.projectId, projectIds));
    return new Map(rows.map((row) => [row.projectId, row]));
  }
}
exports.ProjectRateLimitRepository = ProjectRateLimitRepository;
