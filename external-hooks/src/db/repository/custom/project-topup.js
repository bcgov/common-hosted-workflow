'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ProjectTopupRepository = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const project_topup_1 = require('../../schema/project-topup');
class ProjectTopupRepository {
  db;
  constructor(db) {
    this.db = db;
  }
  /**
   * Returns one page of top-up rows for a project, most recent period first
   * (then newest insertion first within the same period).
   */
  async list(projectId, page, pageSize) {
    const offset = (page - 1) * pageSize;
    const rows = await this.db
      .select()
      .from(project_topup_1.projectTopup)
      .where((0, drizzle_orm_1.eq)(project_topup_1.projectTopup.projectId, projectId))
      .orderBy(
        (0, drizzle_orm_1.desc)(project_topup_1.projectTopup.periodKey),
        (0, drizzle_orm_1.desc)(project_topup_1.projectTopup.createdAt),
      )
      .limit(pageSize)
      .offset(offset);
    const [totals] = await this.db
      .select({ total: (0, drizzle_orm_1.count)() })
      .from(project_topup_1.projectTopup)
      .where((0, drizzle_orm_1.eq)(project_topup_1.projectTopup.projectId, projectId));
    return { rows, totalItems: Number(totals?.total ?? 0) };
  }
  /** Returns a single top-up row within a project, or null when it does not exist. */
  async getById(projectId, topupId) {
    const [row] = await this.db
      .select()
      .from(project_topup_1.projectTopup)
      .where(
        (0, drizzle_orm_1.and)(
          (0, drizzle_orm_1.eq)(project_topup_1.projectTopup.projectId, projectId),
          (0, drizzle_orm_1.eq)(project_topup_1.projectTopup.id, topupId),
        ),
      )
      .limit(1);
    return row ?? null;
  }
  /** Inserts a top-up row and returns the stored record. */
  async create(params) {
    const [row] = await this.db.insert(project_topup_1.projectTopup).values(params).returning();
    return row;
  }
  /** Deletes a top-up row by id. Returns whether a row was removed. */
  async deleteById(topupId) {
    const deleted = await this.db
      .delete(project_topup_1.projectTopup)
      .where((0, drizzle_orm_1.eq)(project_topup_1.projectTopup.id, topupId))
      .returning({ id: project_topup_1.projectTopup.id });
    return deleted.length > 0;
  }
  /**
   * Sums the top-up amounts per project for a single period key in one query.
   * Projects without top-up rows report 0 via the defaulting map lookup.
   */
  async sumByProjectIds(projectIds, periodKey) {
    if (!projectIds.length) {
      return new Map();
    }
    const rows = await this.db
      .select({
        projectId: project_topup_1.projectTopup.projectId,
        total: (0, drizzle_orm_1.sql)`coalesce(sum(${project_topup_1.projectTopup.amount}), 0)::int`,
      })
      .from(project_topup_1.projectTopup)
      .where(
        (0, drizzle_orm_1.and)(
          (0, drizzle_orm_1.inArray)(project_topup_1.projectTopup.projectId, projectIds),
          (0, drizzle_orm_1.eq)(project_topup_1.projectTopup.periodKey, periodKey),
        ),
      )
      .groupBy(project_topup_1.projectTopup.projectId);
    return new Map(rows.map((row) => [row.projectId, Number(row.total)]));
  }
  /**
   * Sums the top-up amounts per project across the given weekly period keys in
   * one query. Used for the yearly aggregation: a weekly top-up raises the
   * yearly limit of every calendar year its week overlaps, so the caller passes
   * all weekly keys overlapping the yearly period. Projects without matching
   * rows report 0 via the defaulting map lookup.
   */
  async sumByProjectIdsInWeeklyKeys(projectIds, weeklyKeys) {
    if (!projectIds.length || !weeklyKeys.length) {
      return new Map();
    }
    const rows = await this.db
      .select({
        projectId: project_topup_1.projectTopup.projectId,
        total: (0, drizzle_orm_1.sql)`coalesce(sum(${project_topup_1.projectTopup.amount}), 0)::int`,
      })
      .from(project_topup_1.projectTopup)
      .where(
        (0, drizzle_orm_1.and)(
          (0, drizzle_orm_1.inArray)(project_topup_1.projectTopup.projectId, projectIds),
          (0, drizzle_orm_1.inArray)(project_topup_1.projectTopup.periodKey, weeklyKeys),
        ),
      )
      .groupBy(project_topup_1.projectTopup.projectId);
    return new Map(rows.map((row) => [row.projectId, Number(row.total)]));
  }
}
exports.ProjectTopupRepository = ProjectTopupRepository;
