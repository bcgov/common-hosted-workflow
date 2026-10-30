import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { projectTopup, type ProjectTopup } from '../../schema/project-topup';

export type ProjectTopupPage = {
  rows: ProjectTopup[];
  totalItems: number;
};

export class ProjectTopupRepository {
  constructor(private readonly db: any) {}

  /**
   * Returns one page of top-up rows for a project, most recent period first
   * (then newest insertion first within the same period).
   */
  async list(projectId: string, page: number, pageSize: number): Promise<ProjectTopupPage> {
    const offset = (page - 1) * pageSize;
    const rows: ProjectTopup[] = await this.db
      .select()
      .from(projectTopup)
      .where(eq(projectTopup.projectId, projectId))
      .orderBy(desc(projectTopup.periodKey), desc(projectTopup.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [totals] = await this.db
      .select({ total: count() })
      .from(projectTopup)
      .where(eq(projectTopup.projectId, projectId));

    return { rows, totalItems: Number(totals?.total ?? 0) };
  }

  /** Returns a single top-up row within a project, or null when it does not exist. */
  async getById(projectId: string, topupId: string): Promise<ProjectTopup | null> {
    const [row] = await this.db
      .select()
      .from(projectTopup)
      .where(and(eq(projectTopup.projectId, projectId), eq(projectTopup.id, topupId)))
      .limit(1);
    return row ?? null;
  }

  /** Inserts a top-up row and returns the stored record. */
  async create(params: {
    projectId: string;
    periodKey: string;
    amount: number;
    adminComment: string;
    createdBy: string | null;
  }): Promise<ProjectTopup> {
    const [row] = await this.db.insert(projectTopup).values(params).returning();
    return row;
  }

  /** Deletes a top-up row by id. Returns whether a row was removed. */
  async deleteById(topupId: string): Promise<boolean> {
    const deleted: Array<{ id: string }> = await this.db
      .delete(projectTopup)
      .where(eq(projectTopup.id, topupId))
      .returning({ id: projectTopup.id });
    return deleted.length > 0;
  }

  /**
   * Sums the top-up amounts per project for a single period key in one query.
   * Projects without top-up rows report 0 via the defaulting map lookup.
   */
  async sumByProjectIds(projectIds: string[], periodKey: string): Promise<Map<string, number>> {
    if (!projectIds.length) {
      return new Map();
    }

    const rows: Array<{ projectId: string; total: number }> = await this.db
      .select({
        projectId: projectTopup.projectId,
        total: sql<number>`coalesce(sum(${projectTopup.amount}), 0)::int`,
      })
      .from(projectTopup)
      .where(and(inArray(projectTopup.projectId, projectIds), eq(projectTopup.periodKey, periodKey)))
      .groupBy(projectTopup.projectId);
    return new Map(rows.map((row) => [row.projectId, Number(row.total)]));
  }
}
