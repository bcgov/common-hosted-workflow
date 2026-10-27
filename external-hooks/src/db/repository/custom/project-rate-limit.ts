import { eq, inArray, sql } from 'drizzle-orm';
import { projectRateLimit, type ProjectRateLimit } from '../../schema/project-rate-limit';

export class ProjectRateLimitRepository {
  constructor(private readonly db: any) {}

  /** Returns the rate-limit configuration row for a project, or null when the project is unconfigured. */
  async get(projectId: string): Promise<ProjectRateLimit | null> {
    const [row] = await this.db
      .select()
      .from(projectRateLimit)
      .where(eq(projectRateLimit.projectId, projectId))
      .limit(1);
    return row ?? null;
  }

  /** Upserts the rate-limit configuration for a project. Uses the primary key on project_id for conflict resolution. */
  async upsert(params: {
    projectId: string;
    weeklyRateLimit: number | null;
    yearlyRateLimit: number | null;
    lastAdminComment: string | null;
    stopBehavior: string;
  }): Promise<void> {
    await this.db
      .insert(projectRateLimit)
      .values(params)
      .onConflictDoUpdate({
        target: projectRateLimit.projectId,
        set: {
          weeklyRateLimit: params.weeklyRateLimit,
          yearlyRateLimit: params.yearlyRateLimit,
          lastAdminComment: params.lastAdminComment,
          stopBehavior: params.stopBehavior,
          updatedAt: sql`now()`,
        },
      });
  }

  /** Returns rate-limit configuration rows for the given projects as a map of projectId → row. */
  async listByProjectIds(projectIds: string[]): Promise<Map<string, ProjectRateLimit>> {
    if (!projectIds.length) {
      return new Map();
    }

    const rows: ProjectRateLimit[] = await this.db
      .select()
      .from(projectRateLimit)
      .where(inArray(projectRateLimit.projectId, projectIds));
    return new Map(rows.map((row: ProjectRateLimit) => [row.projectId, row]));
  }
}
