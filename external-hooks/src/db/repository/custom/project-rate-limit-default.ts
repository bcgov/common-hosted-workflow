import { eq, sql } from 'drizzle-orm';
import {
  projectRateLimitDefault,
  type ProjectRateLimitDefault,
  type RateLimitScopeKind,
} from '../../schema/project-rate-limit-default';

export type RateLimitDefaultsScopeParams = {
  weeklyRateLimit: number | null;
  yearlyRateLimit: number | null;
};

export type UpsertRateLimitDefaultsParams = {
  team: RateLimitDefaultsScopeParams;
  personal: RateLimitDefaultsScopeParams;
  updatedBy: string | null;
};

export class ProjectRateLimitDefaultRepository {
  constructor(private readonly db: any) {}

  /** Returns the defaults row for a project kind, or null when no defaults are saved for it. */
  async get(projectKind: RateLimitScopeKind): Promise<ProjectRateLimitDefault | null> {
    const [row] = await this.db
      .select()
      .from(projectRateLimitDefault)
      .where(eq(projectRateLimitDefault.projectKind, projectKind))
      .limit(1);
    return row ?? null;
  }

  /** Returns every saved defaults row (at most two: team and personal). */
  async getAll(): Promise<ProjectRateLimitDefault[]> {
    return await this.db.select().from(projectRateLimitDefault);
  }

  /**
   * Upserts the defaults for both project kinds in one transaction so the pair
   * saved by the admin dialog cannot land half-applied.
   */
  async upsertBoth(params: UpsertRateLimitDefaultsParams): Promise<void> {
    await this.db.transaction(async (tx: any) => {
      for (const projectKind of ['team', 'personal'] as const) {
        const scope = params[projectKind];
        await tx
          .insert(projectRateLimitDefault)
          .values({
            projectKind,
            weeklyRateLimit: scope.weeklyRateLimit,
            yearlyRateLimit: scope.yearlyRateLimit,
            updatedBy: params.updatedBy,
          })
          .onConflictDoUpdate({
            target: projectRateLimitDefault.projectKind,
            set: {
              weeklyRateLimit: scope.weeklyRateLimit,
              yearlyRateLimit: scope.yearlyRateLimit,
              updatedBy: params.updatedBy,
              updatedAt: sql`now()`,
            },
          });
      }
    });
  }
}
