"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectRateLimitDefaultRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const project_rate_limit_default_1 = require("../../schema/project-rate-limit-default");
class ProjectRateLimitDefaultRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Returns the defaults row for a project kind, or null when no defaults are saved for it. */
    async get(projectKind) {
        const [row] = await this.db
            .select()
            .from(project_rate_limit_default_1.projectRateLimitDefault)
            .where((0, drizzle_orm_1.eq)(project_rate_limit_default_1.projectRateLimitDefault.projectKind, projectKind))
            .limit(1);
        return row ?? null;
    }
    /** Returns every saved defaults row (at most two: team and personal). */
    async getAll() {
        return await this.db.select().from(project_rate_limit_default_1.projectRateLimitDefault);
    }
    /**
     * Upserts the defaults for both project kinds in one transaction so the pair
     * saved by the admin dialog cannot land half-applied.
     */
    async upsertBoth(params) {
        await this.db.transaction(async (tx) => {
            for (const projectKind of ['team', 'personal']) {
                const scope = params[projectKind];
                await tx
                    .insert(project_rate_limit_default_1.projectRateLimitDefault)
                    .values({
                    projectKind,
                    weeklyRateLimit: scope.weeklyRateLimit,
                    yearlyRateLimit: scope.yearlyRateLimit,
                    updatedBy: params.updatedBy,
                })
                    .onConflictDoUpdate({
                    target: project_rate_limit_default_1.projectRateLimitDefault.projectKind,
                    set: {
                        weeklyRateLimit: scope.weeklyRateLimit,
                        yearlyRateLimit: scope.yearlyRateLimit,
                        updatedBy: params.updatedBy,
                        updatedAt: (0, drizzle_orm_1.sql) `now()`,
                    },
                });
            }
        });
    }
}
exports.ProjectRateLimitDefaultRepository = ProjectRateLimitDefaultRepository;
