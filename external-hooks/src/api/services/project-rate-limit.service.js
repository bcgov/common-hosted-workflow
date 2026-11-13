"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectRateLimitService = exports.RateLimitExceededError = exports.MAX_RUN_REQUEST_HORIZON_WEEKS = exports.RUN_REQUEST_MAX_EXTRA_RUNS = exports.RUN_REQUEST_MIN_EXTRA_RUNS = exports.MAX_TOPUP_AMOUNT = exports.MAX_TOPUP_HORIZON_WEEKS = void 0;
const project_access_1 = require("./project-access");
const email_templates_1 = require("./email-templates");
const _config_1 = require("@config");
const period_1 = require("../helpers/period");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createLogger)('ProjectRateLimit');
/** Top-ups may target the current week plus the following 25 (≈ half a year). */
exports.MAX_TOPUP_HORIZON_WEEKS = 26;
/** Upper bound for a single top-up amount, in runs. */
exports.MAX_TOPUP_AMOUNT = 1_000_000;
/**
 * A run request's one-off top-up amount bounds (the dialog's "Between 100 and
 * 50,000 runs") and week horizon: the current week plus the coming 8.
 */
exports.RUN_REQUEST_MIN_EXTRA_RUNS = 100;
exports.RUN_REQUEST_MAX_EXTRA_RUNS = 50_000;
exports.MAX_RUN_REQUEST_HORIZON_WEEKS = 8;
const WEEKLY_KEY_PATTERN = /^\d{4}-W\d{2}$/;
/**
 * Thrown when a configured hard-stop rate limit blocks an execution.
 * The workflow.preExecute hook propagates only this error type to n8n
 * (which aborts the run); every other enforcement error fails open.
 */
class RateLimitExceededError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RateLimitExceededError';
    }
}
exports.RateLimitExceededError = RateLimitExceededError;
function defaultEnrichment() {
    return {
        usesDefaultLimits: true,
        weeklyRateLimit: null,
        yearlyRateLimit: null,
        stopBehavior: null,
        lastAdminComment: null,
        weeklyExecutionCount: 0,
        yearlyExecutionCount: 0,
        weeklyTopupRuns: 0,
        yearlyTopupRuns: 0,
        workflowCount: 0,
        membersCount: 0,
        updatedAt: null,
        updatedByName: null,
    };
}
/**
 * Formats a resolved user as "F. Last". Returns the fallback (the raw editor
 * email, when a user row is missing or the name is incomplete) otherwise.
 */
function formatDisplayName(name, fallbackEmail) {
    if (name && name.firstName.length > 0 && name.lastName.length > 0) {
        return `${name.firstName.charAt(0)}. ${name.lastName}`;
    }
    return fallbackEmail;
}
/**
 * Manual editor runs, n8n-internal runs and evaluation runs are neither
 * counted nor blocked. Evaluation covers n8n's 'evaluation' and 'eval_manual'
 * modes. Re-checked here defensively in case a caller forgets the exemption.
 */
function isExemptMode(mode) {
    return mode === 'manual' || mode === 'internal' || mode.startsWith('evaluation') || mode.startsWith('eval_');
}
/** Near-limit thresholds, highest severity first (matches the UI banner's 80%). */
const NEAR_LIMIT_THRESHOLDS = [80, 50];
/**
 * Project roles that may file (and cancel) a run request: team project admins
 * and editors, plus a personal project's owner — the same membership set the
 * UI button gate uses. Slugs match n8n's `role` table; the relation's `role`
 * column stores the slug directly.
 */
const RUN_REQUEST_ROLE_SLUGS = ['project:admin', 'project:editor', 'project:personalOwner'];
/**
 * Project roles that receive rate-limit emails: team project admins and
 * editors, plus a personal project's owner (its only member). Slugs match
 * n8n's `role` table; the relation's `role` column stores the slug directly.
 */
const RATE_LIMIT_NOTIFY_ROLE_SLUGS = ['project:admin', 'project:editor', 'project:personalOwner'];
function formatRuns(count) {
    return count.toLocaleString('en-CA');
}
function periodLabel(period) {
    return period === 'weekly' ? 'weekly' : 'annual';
}
/**
 * Derives the notification events for one run's limit check: a "reached"
 * event when the count is at or over the effective limit (kind reflects the
 * enforced stop behaviour), otherwise the highest near-limit threshold the
 * count has crossed (80% before 50%). Periods without an effective limit
 * produce no events.
 */
function collectLimitEvents(params) {
    const events = [];
    for (const period of ['weekly', 'yearly']) {
        const state = params[period];
        if (state === null) {
            continue;
        }
        const limit = state.base + state.topupRuns;
        const periodKey = state.periodKey;
        const topupRuns = state.topupRuns;
        const count = state.count;
        if (count >= limit) {
            events.push({
                kind: `${period}_reached_${params.stopBehavior === 'soft_stop' ? 'soft' : 'hard'}`,
                period,
                periodKey,
                percent: 100,
                limit,
                count,
                topupRuns,
            });
            continue;
        }
        for (const threshold of NEAR_LIMIT_THRESHOLDS) {
            // Integer math only: count/limit vs threshold/100 without floats.
            if (count * 100 >= limit * threshold) {
                events.push({
                    kind: `${period}_near_${threshold}`,
                    period,
                    periodKey,
                    percent: Math.floor((count * 100) / limit),
                    limit,
                    count,
                    topupRuns,
                });
                break;
            }
        }
    }
    return events;
}
function isReachedEvent(event) {
    return event.kind.endsWith('_reached_soft') || event.kind.endsWith('_reached_hard');
}
function isHardStopEvent(event) {
    return event.kind.endsWith('_reached_hard');
}
function renderLimitEventEmail(event, projectName, projectUrl) {
    const label = periodLabel(event.period);
    if (isReachedEvent(event)) {
        const resetDate = event.period === 'weekly' ? (0, period_1.getNextWeeklyReset)() : (0, period_1.getNextYearlyReset)();
        return {
            subject: `${projectName}: ${label} limit reached`,
            html: (0, email_templates_1.renderEmail)('rateLimitReached', {
                projectName,
                periodLabel: label,
                used: formatRuns(event.count),
                limit: formatRuns(event.limit),
                includesTopup: event.topupRuns > 0,
                topupRuns: formatRuns(event.topupRuns),
                hardStop: isHardStopEvent(event),
                resetDate: (0, period_1.formatPeriodDateLong)(resetDate),
                projectUrl,
            }),
        };
    }
    return {
        subject: `${projectName}: ${label} limit at ${event.percent}%`,
        html: (0, email_templates_1.renderEmail)('rateLimitNearLimit', {
            projectName,
            periodLabel: label,
            percent: String(event.percent),
            used: formatRuns(event.count),
            limit: formatRuns(event.limit),
            projectUrl,
        }),
    };
}
function describeBreach(projectId, breach) {
    const label = breach.period === 'weekly' ? 'Weekly' : 'Yearly';
    const limitText = breach.topupRuns !== undefined && breach.topupRuns > 0
        ? `${breach.limit} (base ${breach.limit - breach.topupRuns} + ${breach.topupRuns} top-up)`
        : `${breach.limit}`;
    return `${label} execution limit reached for project '${projectId}' (limit ${limitText}, used ${breach.count} in ${breach.periodKey}).`;
}
function serializeTopup(row) {
    return {
        id: row.id,
        projectId: row.projectId,
        periodKey: row.periodKey,
        amount: row.amount,
        adminComment: row.adminComment,
        createdBy: row.createdBy,
        createdAt: row.createdAt.toISOString(),
    };
}
function serializeRunRequest(row) {
    return {
        id: row.id,
        requestKind: row.requestKind,
        extraRuns: row.extraRuns,
        periodKey: row.periodKey,
        requestedWeeklyLimit: row.requestedWeeklyLimit,
        requestedAnnualLimit: row.requestedAnnualLimit,
        reason: row.reason,
        requestedBy: row.requestedBy,
        createdAt: row.createdAt.toISOString(),
    };
}
/** True for a PostgreSQL unique-violation error (used for the pending-per-project race). */
function isUniqueViolation(error) {
    return typeof error === 'object' && error !== null && error.code === '23505';
}
/** Role labels shown next to the requester's name ("From Jordan Lee (Editor)"). */
const RUN_REQUEST_ROLE_LABELS = {
    'project:admin': 'Admin',
    'project:editor': 'Editor',
    'project:personalOwner': 'Owner',
};
/**
 * Full-name formatter for the admin surfaces (the member-side view uses the
 * initials style via formatDisplayName; these mocks show full names).
 */
function formatFullName(name, fallbackEmail) {
    const first = name?.firstName?.trim() ?? '';
    const last = name?.lastName?.trim() ?? '';
    if (first.length > 0 && last.length > 0) {
        return `${first} ${last}`;
    }
    if (first.length > 0) {
        return first;
    }
    return fallbackEmail;
}
function serializeDecisionFields(row) {
    return {
        grantedRuns: row.grantedRuns,
        decidedWeeklyLimit: row.decidedWeeklyLimit,
        decidedAnnualLimit: row.decidedAnnualLimit,
        decisionNote: row.decisionNote,
        decidedBy: row.decidedBy,
        decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    };
}
function serializeScopeDefaults(row) {
    return {
        weeklyRateLimit: row?.weeklyRateLimit ?? null,
        yearlyRateLimit: row?.yearlyRateLimit ?? null,
    };
}
class ProjectRateLimitService {
    n8nRepositories;
    customRepositories;
    nodeMailerService;
    constructor(n8nRepositories, customRepositories, 
    /**
     * Optional mailer for rate-limit notifications. Null (the default)
     * disables notifications without affecting enforcement — the contract
     * `AccessRequestService` uses for its optional mailer as well.
     */
    nodeMailerService = null) {
        this.n8nRepositories = n8nRepositories;
        this.customRepositories = customRepositories;
        this.nodeMailerService = nodeMailerService;
    }
    /**
     * Enforces per-project execution rate limits for a workflow run and, when
     * allowed, counts the usage against the current weekly/yearly periods.
     *
     * - Check-then-increment: a hard-stop breach throws before any increment
     *   (rejected runs are not counted).
     * - Always-count: unlimited/unconfigured projects still accumulate usage so
     *   the admin UI shows usage for all projects.
     * - Fail-open: any infrastructure error is logged and the execution is
     *   allowed; only RateLimitExceededError propagates.
     */
    async enforceExecution(params) {
        const { workflowId, mode, countUsage } = params;
        if (isExemptMode(mode)) {
            return;
        }
        try {
            const projectIds = await this.n8nRepositories.sharedWorkflow.findProjectIds(workflowId);
            if (projectIds.length === 0) {
                log.debug('Workflow is not shared with any project; skipping rate limiting', { workflowId, mode });
                return;
            }
            if (projectIds.length > 1) {
                log.warn('Workflow shared with multiple projects; rate limiting against the first', {
                    workflowId,
                    projectIds,
                });
            }
            const projectId = projectIds[0];
            const config = await this.customRepositories.projectRateLimit.get(projectId);
            const periodKeys = (0, period_1.getCurrentPeriodKeys)();
            const counts = await this.customRepositories.projectExecutionUsage.getCounts(projectId, periodKeys.weekly, periodKeys.yearly);
            // Effective base limits. Default mode (the flag's default, also for
            // unconfigured projects) ignores the row's own values entirely and
            // follows the scope's saved defaults (team/personal). Custom mode
            // resolves the project's own configuration first, then its scope's
            // saved defaults per unset period. A scope with no defaults stays
            // uncapped for that period. The project-kind lookup runs only when a
            // scope default can matter, keeping fully custom-configured projects
            // at the same query count as before.
            const useDefaults = config?.usesDefaultLimits ?? true;
            let weeklyBase = !useDefaults ? (config?.weeklyRateLimit ?? null) : null;
            let yearlyBase = !useDefaults ? (config?.yearlyRateLimit ?? null) : null;
            if (weeklyBase === null || yearlyBase === null) {
                const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
                const kind = project?.type === 'personal' ? 'personal' : 'team';
                const defaults = await this.customRepositories.projectRateLimitDefault.get(kind);
                weeklyBase = weeklyBase ?? defaults?.weeklyRateLimit ?? null;
                yearlyBase = yearlyBase ?? defaults?.yearlyRateLimit ?? null;
            }
            // Top-ups raise the effective weekly limit whenever a weekly base is
            // enforced, whether it comes from the project's own configuration or a
            // scope default. Every counted run also accrues to the calendar-year
            // counter, so the sum of all weekly top-ups whose weeks overlap the
            // current year raises the yearly limit by the same amount — otherwise
            // the yearly gate could block runs the top-up-boosted weekly gate
            // allowed.
            let weeklyTopupRuns = 0;
            let yearlyTopupRuns = 0;
            if (weeklyBase !== null || yearlyBase !== null) {
                const [weeklySums, yearlySums] = await Promise.all([
                    weeklyBase !== null
                        ? this.customRepositories.projectTopup.sumByProjectIds([projectId], periodKeys.weekly)
                        : Promise.resolve(new Map()),
                    yearlyBase !== null
                        ? this.customRepositories.projectTopup.sumByProjectIdsInWeeklyKeys([projectId], (0, period_1.listWeeklyPeriodKeysOverlappingYearlyPeriod)(periodKeys.yearly))
                        : Promise.resolve(new Map()),
                ]);
                weeklyTopupRuns = weeklySums.get(projectId) ?? 0;
                yearlyTopupRuns = yearlySums.get(projectId) ?? 0;
            }
            const stopBehavior = !useDefaults && config?.stopBehavior === 'soft_stop' ? 'soft_stop' : 'hard_stop';
            const limitEvents = collectLimitEvents({
                weekly: weeklyBase === null
                    ? null
                    : { base: weeklyBase, topupRuns: weeklyTopupRuns, count: counts.weeklyCount, periodKey: periodKeys.weekly },
                yearly: yearlyBase === null
                    ? null
                    : {
                        base: yearlyBase,
                        topupRuns: yearlyTopupRuns,
                        count: counts.yearlyCount,
                        periodKey: periodKeys.yearly,
                    },
                stopBehavior,
            });
            const breaches = limitEvents.filter(isReachedEvent).map((event) => ({
                period: event.period,
                periodKey: event.periodKey,
                limit: event.limit,
                count: event.count,
                topupRuns: event.topupRuns > 0 ? event.topupRuns : undefined,
            }));
            if (limitEvents.length > 0) {
                // Fire-and-forget: spawned before a hard-stop throw so a rejected
                // run still triggers its one-time notification.
                this.notifyLimitEvents(projectId, limitEvents);
            }
            if (breaches.length > 0) {
                if (stopBehavior === 'soft_stop') {
                    for (const breach of breaches) {
                        log.warn(`${describeBreach(projectId, breach)} Soft stop configured — execution continues`, {
                            projectId,
                            workflowId,
                            period: breach.period,
                            periodKey: breach.periodKey,
                            limit: breach.limit,
                            count: breach.count,
                            stopBehavior: 'soft_stop',
                        });
                    }
                }
                else {
                    const breach = breaches[0];
                    throw new RateLimitExceededError(`${describeBreach(projectId, breach)} Execution rejected; contact the platform team to adjust rate limits.`);
                }
            }
            if (countUsage) {
                await this.customRepositories.projectExecutionUsage.increment(projectId, 'weekly', periodKeys.weekly);
                await this.customRepositories.projectExecutionUsage.increment(projectId, 'yearly', periodKeys.yearly);
                await this.customRepositories.workflowExecutionUsage.increment(projectId, workflowId, 'weekly', periodKeys.weekly);
                await this.customRepositories.workflowExecutionUsage.increment(projectId, workflowId, 'yearly', periodKeys.yearly);
            }
        }
        catch (error) {
            if (error instanceof RateLimitExceededError) {
                throw error;
            }
            log.error('Rate limit enforcement failed — failing open', {
                workflowId,
                mode,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    // -------------------------------------------------------------------------
    // Email notifications (fire-and-forget; failures logged, never thrown)
    // -------------------------------------------------------------------------
    async resolveProjectContext(projectId) {
        const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
        if (!project) {
            return null;
        }
        return {
            projectName: project.name,
            projectType: project.type,
            projectUrl: `${_config_1.UI_APP_BASE_URL}/projects/${projectId}`,
        };
    }
    /** Resolves the project's admin/editor email addresses (the notification recipients). */
    async resolveProjectRecipientEmails(projectId) {
        const emailsByProject = await this.n8nRepositories.projectRelation.listMemberEmailsByProjectIdsAndRoles([projectId], [...RATE_LIMIT_NOTIFY_ROLE_SLUGS]);
        return emailsByProject.get(projectId) ?? [];
    }
    /**
     * Spawns the notification dispatch for the given enforcement-time events.
     * Deliberately not awaited by enforcement: SMTP latency must never delay
     * (or fail) a workflow run, and a rejected run still gets its notification
     * because the spawn happens before the hard-stop throw.
     */
    notifyLimitEvents(projectId, events) {
        if (!this.nodeMailerService || events.length === 0) {
            return;
        }
        void this.dispatchLimitNotifications(projectId, events).catch((error) => {
            log.error('Rate-limit notification dispatch failed', {
                projectId,
                error: error instanceof Error ? error.message : String(error),
            });
        });
    }
    async dispatchLimitNotifications(projectId, events) {
        try {
            // Send-once semantics: the first claim wins; concurrent runs (in any
            // process) that find the claim already present stay silent.
            const claimed = [];
            for (const event of events) {
                const won = await this.customRepositories.rateLimitNotification.claim({
                    projectId,
                    periodKey: event.periodKey,
                    eventKind: event.kind,
                    usageCount: event.count,
                });
                if (won) {
                    claimed.push(event);
                }
            }
            if (claimed.length === 0) {
                log.debug('Rate-limit notifications already sent for these periods; skipping', { projectId });
                return;
            }
            const context = await this.resolveProjectContext(projectId);
            if (!context) {
                log.warn('Project not found when sending rate-limit notifications', { projectId });
                return;
            }
            const recipients = new Set(await this.resolveProjectRecipientEmails(projectId));
            // Hard-stop reached events are incidents platform admins should see too.
            if (claimed.some(isHardStopEvent)) {
                for (const email of await this.n8nRepositories.user.findAdminEmails()) {
                    recipients.add(email);
                }
            }
            if (recipients.size === 0) {
                log.warn('No rate-limit notification recipients resolved', {
                    projectId,
                    kinds: claimed.map((event) => event.kind),
                });
                return;
            }
            for (const event of claimed) {
                const { subject, html } = renderLimitEventEmail(event, context.projectName, context.projectUrl);
                await Promise.all([...recipients].map((to) => this.nodeMailerService.sendMail({ to, subject, html })));
            }
            log.info('Sent rate-limit notification emails', {
                projectId,
                kinds: claimed.map((event) => event.kind),
                recipientCount: recipients.size,
            });
        }
        catch (error) {
            log.error('Failed to send rate-limit notification emails', {
                projectId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    /**
     * Spawns a config-change notification (top-up granted, limits changed) for
     * the project's admins and editors. Fire-and-forget like enforcement-time
     * notifications; `reason` only labels log lines.
     */
    notifyConfigEvent(projectId, render, reason) {
        if (!this.nodeMailerService) {
            return;
        }
        void (async () => {
            try {
                const context = await this.resolveProjectContext(projectId);
                if (!context) {
                    log.warn(`Project not found when sending the ${reason} email`, { projectId });
                    return;
                }
                const emails = await this.resolveProjectRecipientEmails(projectId);
                if (emails.length === 0) {
                    log.warn(`No recipients resolved for the ${reason} email`, { projectId });
                    return;
                }
                const { subject, html } = await render(context);
                await Promise.all(emails.map((to) => this.nodeMailerService.sendMail({ to, subject, html })));
                log.info(`Sent the ${reason} email`, { projectId, recipientCount: emails.length });
            }
            catch (error) {
                log.error(`Failed to send the ${reason} email`, {
                    projectId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        })();
    }
    notifyTopupGranted(projectId, topup) {
        this.notifyConfigEvent(projectId, ({ projectName, projectUrl }) => Promise.resolve({
            subject: `Extra runs added for ${projectName}`,
            html: (0, email_templates_1.renderEmail)('rateLimitTopupGranted', {
                projectName,
                amount: formatRuns(topup.amount),
                weekDescription: (0, period_1.describeWeeklyPeriodKey)(topup.periodKey) ?? topup.periodKey,
                projectUrl,
            }),
        }), 'top-up granted');
    }
    notifyLimitsChanged(projectId, stored) {
        this.notifyConfigEvent(projectId, async ({ projectName, projectType, projectUrl }) => {
            // The email shows the limits that will actually be enforced: scope
            // defaults in default mode, custom values (with per-period defaults
            // fallback) in custom mode — resolved exactly like enforcement.
            const kind = projectType === 'personal' ? 'personal' : 'team';
            const defaults = await this.customRepositories.projectRateLimitDefault.get(kind);
            const effectiveWeekly = stored.usesDefaultLimits
                ? (defaults?.weeklyRateLimit ?? null)
                : (stored.weeklyRateLimit ?? defaults?.weeklyRateLimit ?? null);
            const effectiveYearly = stored.usesDefaultLimits
                ? (defaults?.yearlyRateLimit ?? null)
                : (stored.yearlyRateLimit ?? defaults?.yearlyRateLimit ?? null);
            const limitText = (value) => (value === null ? 'No limit' : `${formatRuns(value)} runs`);
            return {
                subject: `Execution limits updated for ${projectName}`,
                html: (0, email_templates_1.renderEmail)('rateLimitLimitsChanged', {
                    projectName,
                    weeklyLimit: limitText(effectiveWeekly),
                    yearlyLimit: limitText(effectiveYearly),
                    changedBy: stored.updatedBy,
                    projectUrl,
                }),
            };
        }, 'limits-changed');
    }
    /**
     * Replaces the rate-limit configuration for a project (full-replace semantics).
     * With `usesDefaultLimits` the project follows its scope's saved defaults:
     * the row is normalized to the unconfigured shape (null limits, hard stop) so
     * stored values always mirror what enforcement uses in custom mode; the
     * admin comment is kept as the audit trail. Custom mode stores the given
     * values. `updatedBy` records the acting admin's email (trimmed; an empty
     * value is stored as null — display names are resolved at read time).
     * Throws AppError 404 when the project does not exist in n8n.
     */
    async updateRateLimit(projectId, body, updatedBy) {
        await this.assertProjectExists(projectId);
        const normalized = body.usesDefaultLimits
            ? {
                usesDefaultLimits: true,
                weeklyRateLimit: null,
                yearlyRateLimit: null,
                lastAdminComment: body.lastAdminComment,
                stopBehavior: 'hard_stop',
            }
            : { ...body, usesDefaultLimits: false };
        const trimmedUpdatedBy = updatedBy !== null && updatedBy.trim().length > 0 ? updatedBy.trim() : null;
        await this.customRepositories.projectRateLimit.upsert({ projectId, ...normalized, updatedBy: trimmedUpdatedBy });
        const stored = await this.customRepositories.projectRateLimit.get(projectId);
        if (!stored) {
            throw new errors_1.AppError(500, 'Failed to read the stored rate limit');
        }
        this.notifyLimitsChanged(projectId, stored);
        return stored;
    }
    /**
     * Returns the saved per-scope default limits. A missing row or null limit
     * means "no default" — projects of that scope without their own limits stay
     * uncapped. The response intentionally contains no usage counts; the
     * defaults dialog needs only the saved values.
     */
    async getRateLimitDefaults() {
        const rows = await this.customRepositories.projectRateLimitDefault.getAll();
        const byKind = new Map(rows.map((row) => [row.projectKind, row]));
        return {
            team: serializeScopeDefaults(byKind.get('team') ?? null),
            personal: serializeScopeDefaults(byKind.get('personal') ?? null),
        };
    }
    /**
     * Replaces the per-scope default limits (full-replace semantics; both scopes
     * are written atomically). `updatedBy` records the acting admin's email
     * (trimmed; an empty value is stored as null).
     */
    async updateRateLimitDefaults(body, updatedBy) {
        const trimmedUpdatedBy = updatedBy !== null && updatedBy.trim().length > 0 ? updatedBy.trim() : null;
        await this.customRepositories.projectRateLimitDefault.upsertBoth({
            team: { ...body.team },
            personal: { ...body.personal },
            updatedBy: trimmedUpdatedBy,
        });
        return {
            team: { ...body.team },
            personal: { ...body.personal },
        };
    }
    /**
     * Batch-fetches rate-limit configuration, current-period usage and workflow
     * counts for the given projects (one query per source, no per-item loops)
     * and returns the enrichment keyed by projectId. Limits are resolved exactly
     * as enforcement resolves them: default-mode (or unconfigured) projects get
     * their scope's saved limits, custom-mode projects their own values with
     * scope defaults per unset period — so the UI can show the limits that are
     * actually enforced, plus the mode that produced them. Unconfigured projects
     * get null limits/comment and zero counts.
     *
     * Never throws: on any error the default enrichment is returned so the
     * project list keeps working during custom-DB outages.
     */
    async enrichProjectsWithRateLimits(items) {
        const projectIds = items.map((item) => item.projectId);
        const enrichment = {};
        for (const item of items) {
            enrichment[item.projectId] = defaultEnrichment();
        }
        if (projectIds.length === 0) {
            return enrichment;
        }
        try {
            const periodKeys = (0, period_1.getCurrentPeriodKeys)();
            const yearOverlapKeys = (0, period_1.listWeeklyPeriodKeysOverlappingYearlyPeriod)(periodKeys.yearly);
            const [rateLimitMap, usageMap, workflowCountMap, memberCountMap, topupMap, yearlyTopupMap, defaultsRows] = await Promise.all([
                this.customRepositories.projectRateLimit.listByProjectIds(projectIds),
                this.customRepositories.projectExecutionUsage.listCountsByProjectIds(projectIds, periodKeys.weekly, periodKeys.yearly),
                this.n8nRepositories.sharedWorkflow.countByProjectIds(projectIds),
                this.n8nRepositories.projectRelation.countMembersByProjectIds(projectIds),
                this.customRepositories.projectTopup.sumByProjectIds(projectIds, periodKeys.weekly),
                this.customRepositories.projectTopup.sumByProjectIdsInWeeklyKeys(projectIds, yearOverlapKeys),
                this.customRepositories.projectRateLimitDefault.getAll(),
            ]);
            const defaultsByKind = new Map(defaultsRows.map((row) => [row.projectKind, row]));
            // A failed name lookup must not discard the enrichment it accompanies,
            // so resolution degrades to its own catch (updatedByName → null) instead
            // of joining the outer fail-all catch below.
            const editorEmails = [
                ...new Set(projectIds
                    .map((projectId) => rateLimitMap.get(projectId)?.updatedBy)
                    .filter((email) => typeof email === 'string' && email.trim().length > 0)
                    .map((email) => email.trim())),
            ];
            let nameMap;
            try {
                nameMap = await this.n8nRepositories.user.findUserNamesByEmails(editorEmails);
            }
            catch (error) {
                log.error('Failed to resolve rate-limit editor display names; falling back to emails', {
                    error: error instanceof Error ? error.message : String(error),
                });
                nameMap = null;
            }
            for (const item of items) {
                const projectId = item.projectId;
                const config = rateLimitMap.get(projectId);
                const usage = usageMap.get(projectId);
                const workflowCount = workflowCountMap.get(projectId);
                const memberCount = memberCountMap.get(projectId);
                const editorEmail = config?.updatedBy != null && config.updatedBy.trim().length > 0 ? config.updatedBy.trim() : null;
                const editorName = nameMap?.get(editorEmail?.toLowerCase() ?? '');
                const useDefaults = config?.usesDefaultLimits ?? true;
                const kind = item.projectType === 'personal' ? 'personal' : 'team';
                const defaults = defaultsByKind.get(kind) ?? null;
                enrichment[projectId] = {
                    usesDefaultLimits: useDefaults,
                    weeklyRateLimit: useDefaults
                        ? (defaults?.weeklyRateLimit ?? null)
                        : (config?.weeklyRateLimit ?? defaults?.weeklyRateLimit ?? null),
                    yearlyRateLimit: useDefaults
                        ? (defaults?.yearlyRateLimit ?? null)
                        : (config?.yearlyRateLimit ?? defaults?.yearlyRateLimit ?? null),
                    stopBehavior: !useDefaults && config ? (config.stopBehavior ?? null) : null,
                    lastAdminComment: config?.lastAdminComment ?? null,
                    weeklyExecutionCount: usage?.weeklyCount ?? 0,
                    yearlyExecutionCount: usage?.yearlyCount ?? 0,
                    weeklyTopupRuns: topupMap.get(projectId) ?? 0,
                    yearlyTopupRuns: yearlyTopupMap.get(projectId) ?? 0,
                    workflowCount: workflowCount ?? 0,
                    membersCount: memberCount ?? 0,
                    updatedAt: config?.updatedAt ? config.updatedAt.toISOString() : null,
                    updatedByName: nameMap ? formatDisplayName(editorName, editorEmail) : null,
                };
            }
        }
        catch (error) {
            log.error('Failed to enrich admin projects with rate-limit data; returning defaults', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
        return enrichment;
    }
    /**
     * Returns the current-period per-workflow execution usage for a project.
     * Workflows come from n8n's shared-workflow table; usage rows for workflows
     * no longer in the project are excluded. Sorted by workflow name ascending.
     * Throws AppError 404 when the project does not exist in n8n.
     */
    async getProjectWorkflowUsage(projectId) {
        await this.assertProjectExists(projectId);
        const workflowRows = await this.n8nRepositories.sharedWorkflow.findWorkflowRowsByProjectIds([projectId]);
        const periodKeys = (0, period_1.getCurrentPeriodKeys)();
        const counts = await this.customRepositories.workflowExecutionUsage.listCountsByWorkflowIds(projectId, workflowRows.map((row) => row.workflowId), periodKeys.weekly, periodKeys.yearly);
        const workflows = workflowRows
            .map((row) => ({
            workflowId: row.workflowId,
            workflowName: row.workflowName,
            weeklyCount: counts.get(row.workflowId)?.weeklyCount ?? 0,
            yearlyCount: counts.get(row.workflowId)?.yearlyCount ?? 0,
        }))
            .sort((a, b) => a.workflowName.localeCompare(b.workflowName));
        return {
            projectId,
            weeklyPeriodKey: periodKeys.weekly,
            yearlyPeriodKey: periodKeys.yearly,
            workflows,
        };
    }
    /**
     * Lists a project's top-ups, most recent period first. Throws AppError 404
     * when the project does not exist in n8n.
     */
    async listProjectTopups(projectId, page, pageSize) {
        await this.assertProjectExists(projectId);
        const { rows, totalItems } = await this.customRepositories.projectTopup.list(projectId, page, pageSize);
        return {
            data: rows.map(serializeTopup),
            pagination: {
                page,
                pageSize,
                totalItems,
                totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
            },
        };
    }
    /**
     * Adds a one-off top-up to a project's weekly limit for a target week.
     * The period key must be the current week or one of the following weeks
     * within the top-up horizon (validated against the live key list, so ISO
     * year rollovers are handled); the amount must be a whole number within
     * bounds. Throws AppError 404 for unknown projects and 400 for invalid
     * input. Re-validates route-level zod input for direct callers.
     */
    async createProjectTopup(projectId, body, createdBy) {
        await this.assertProjectExists(projectId);
        if (!WEEKLY_KEY_PATTERN.test(body.periodKey)) {
            throw new errors_1.AppError(400, 'periodKey must match the weekly format YYYY-Www');
        }
        if (!(0, period_1.listUpcomingWeeklyPeriodKeys)(exports.MAX_TOPUP_HORIZON_WEEKS).includes(body.periodKey)) {
            throw new errors_1.AppError(400, 'periodKey must be the current week or a coming week within the top-up horizon');
        }
        if (!Number.isInteger(body.amount) || body.amount < 1 || body.amount > exports.MAX_TOPUP_AMOUNT) {
            throw new errors_1.AppError(400, `amount must be a whole number between 1 and ${exports.MAX_TOPUP_AMOUNT}`);
        }
        const trimmedCreatedBy = createdBy !== null && createdBy.trim().length > 0 ? createdBy.trim() : null;
        const created = await this.customRepositories.projectTopup.create({
            projectId,
            periodKey: body.periodKey,
            amount: body.amount,
            adminComment: body.adminComment.trim(),
            createdBy: trimmedCreatedBy,
        });
        this.notifyTopupGranted(projectId, created);
        return created;
    }
    /**
     * Deletes a top-up row. Only top-ups whose target week has not started are
     * deletable (the key must sort after the current weekly key; both keys are
     * zero-padded so lexicographic order matches calendar order).
     * Throws AppError 404 for unknown projects/rows and 409 for started weeks.
     */
    async deleteProjectTopup(projectId, topupId) {
        await this.assertProjectExists(projectId);
        const row = await this.customRepositories.projectTopup.getById(projectId, topupId);
        if (!row) {
            throw new errors_1.AppError(404, 'Top-up not found');
        }
        const { weekly } = (0, period_1.getCurrentPeriodKeys)();
        if (row.periodKey <= weekly) {
            throw new errors_1.AppError(409, 'Top-ups for the current or past weeks cannot be deleted');
        }
        await this.customRepositories.projectTopup.deleteById(topupId);
    }
    /**
     * Returns the project's pending run request for the detail payload, or null
     * when none is open. Fail-open: an unreadable table must not take the whole
     * project detail endpoint down, so errors log and render no review panel.
     */
    async getPendingRunRequest(projectId) {
        try {
            const row = await this.customRepositories.rateLimitRequest.getPendingByProjectId(projectId);
            return row ? serializeRunRequest(row) : null;
        }
        catch (error) {
            log.error('Failed to read the pending run request; rendering the detail page without it', {
                projectId,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }
    /**
     * Files a member "Request more runs" submission. Membership-gated exactly
     * like the UI button: team project admins/editors and personal owners may
     * file; a platform admin without a project relation may not. One pending
     * request per project — a concurrent or duplicate submit fails with 409.
     * Throws AppError 404 (unknown project), 403 (not eligible), 400 (invalid
     * kind/field coherence, bounds, or week horizon) and 409 (pending exists).
     */
    async createRunRequest(projectId, userId, body) {
        const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
        if (!project) {
            throw new errors_1.AppError(404, 'Project not found');
        }
        if (userId.trim() === '') {
            throw new errors_1.AppError(403, 'Only project admins, editors and personal owners can request more runs');
        }
        const viewerRole = await (0, project_access_1.getViewerProjectRole)(this.n8nRepositories.project, this.n8nRepositories.projectRelation, userId, projectId);
        if (viewerRole === null || !RUN_REQUEST_ROLE_SLUGS.includes(viewerRole)) {
            throw new errors_1.AppError(403, 'Only project admins, editors and personal owners can request more runs');
        }
        const kind = body.requestKind;
        const extraRuns = body.extraRuns ?? null;
        const periodKey = body.periodKey ?? null;
        const requestedWeeklyLimit = body.requestedWeeklyLimit ?? null;
        const requestedAnnualLimit = body.requestedAnnualLimit ?? null;
        const reason = body.reason.trim();
        if (kind === 'extra_runs') {
            if (extraRuns === null ||
                !Number.isInteger(extraRuns) ||
                extraRuns < exports.RUN_REQUEST_MIN_EXTRA_RUNS ||
                extraRuns > exports.RUN_REQUEST_MAX_EXTRA_RUNS) {
                throw new errors_1.AppError(400, `extraRuns must be a whole number between ${exports.RUN_REQUEST_MIN_EXTRA_RUNS} and ${exports.RUN_REQUEST_MAX_EXTRA_RUNS}`);
            }
            if (periodKey === null ||
                !WEEKLY_KEY_PATTERN.test(periodKey) ||
                !(0, period_1.listUpcomingWeeklyPeriodKeys)(exports.MAX_RUN_REQUEST_HORIZON_WEEKS).includes(periodKey)) {
                throw new errors_1.AppError(400, 'periodKey must be the current week or one of the coming 8 weeks');
            }
            if (requestedWeeklyLimit !== null || requestedAnnualLimit !== null) {
                throw new errors_1.AppError(400, 'Limit changes belong to the limit_increase request kind');
            }
        }
        else {
            if (extraRuns !== null || periodKey !== null) {
                throw new errors_1.AppError(400, 'extraRuns and periodKey belong to the extra_runs request kind');
            }
            if (requestedWeeklyLimit === null && requestedAnnualLimit === null) {
                throw new errors_1.AppError(400, 'Propose at least one of requestedWeeklyLimit or requestedAnnualLimit');
            }
            if (requestedWeeklyLimit !== null && requestedAnnualLimit !== null && requestedAnnualLimit < requestedWeeklyLimit) {
                throw new errors_1.AppError(400, 'requestedAnnualLimit must be at least the requestedWeeklyLimit');
            }
        }
        const pending = await this.customRepositories.rateLimitRequest.getPendingByProjectId(projectId);
        if (pending) {
            throw new errors_1.AppError(409, 'This project already has a request waiting for review');
        }
        try {
            const created = await this.customRepositories.rateLimitRequest.create({
                projectId,
                requestKind: kind,
                extraRuns,
                periodKey,
                requestedWeeklyLimit,
                requestedAnnualLimit,
                reason,
                requestedBy: userId,
            });
            return serializeRunRequest(created);
        }
        catch (error) {
            // The partial unique index is the race-safe guard: a concurrent submit
            // may have won between the pre-check and this insert.
            if (isUniqueViolation(error)) {
                throw new errors_1.AppError(409, 'This project already has a request waiting for review');
            }
            throw error;
        }
    }
    /**
     * Cancels the requester's own pending run request. Throws AppError 404 for
     * unknown projects and for requests that are missing, already decided, or
     * filed by someone else (those are indistinguishable to the requester).
     */
    async cancelRunRequest(projectId, requestId, userId) {
        await this.assertProjectExists(projectId);
        const cancelled = await this.customRepositories.rateLimitRequest.cancelPending(requestId, projectId, userId);
        if (!cancelled) {
            throw new errors_1.AppError(404, 'Pending request not found');
        }
    }
    // -------------------------------------------------------------------------
    // Admin review of run requests (list + approve/deny)
    // -------------------------------------------------------------------------
    /**
     * Lists run requests for the admin review page, enriched per row. Pending
     * requests sort oldest-first (review-queue order); every other status — and
     * the 'all' filter — sorts newest-first. Search matches project name or the
     * requester's name/email. The pending counts are returned regardless of the
     * filter so the stat tile stays live.
     */
    async listRunRequestsForAdmin(query) {
        const dbStatuses = query.status === 'all'
            ? ['pending', 'approved', 'rejected', 'cancelled']
            : query.status === 'denied'
                ? ['rejected']
                : [query.status];
        const [rows, pendingRows] = await Promise.all([
            this.customRepositories.rateLimitRequest.listByStatuses(dbStatuses),
            this.customRepositories.rateLimitRequest.listByStatuses(['pending']),
        ]);
        // Pending keeps the queue's oldest-first order; everything else is newest-first.
        if (query.status !== 'pending') {
            rows.sort((a, b) => {
                const byDate = b.createdAt.getTime() - a.createdAt.getTime();
                return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
            });
        }
        const items = await this.enrichRunRequests(rows);
        const search = query.search?.trim().toLowerCase() ?? '';
        const filtered = search.length > 0
            ? items.filter((item) => item.projectName.toLowerCase().includes(search) ||
                (item.requestedByName ?? '').toLowerCase().includes(search) ||
                (item.requestedByEmail ?? '').toLowerCase().includes(search))
            : items;
        const page = Math.max(1, Math.floor(query.page));
        const pageSize = Math.max(1, Math.floor(query.pageSize));
        const totalItems = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const start = (page - 1) * pageSize;
        const oldestPending = pendingRows.reduce((oldest, row) => (oldest === null || row.createdAt < oldest ? row.createdAt : oldest), null);
        return {
            data: filtered.slice(start, start + pageSize),
            pagination: { page, pageSize, totalItems, totalPages },
            pending: {
                count: pendingRows.length,
                oldestCreatedAt: oldestPending ? oldestPending.toISOString() : null,
            },
        };
    }
    /**
     * Approves a pending run request and fulfills it atomically: extra-runs
     * requests become a top-up for the asked week, limit-raise requests become a
     * custom limits configuration (full-replace semantics like Edit limits).
     * The reviewing admin may grant less than asked, never more. Throws AppError
     * 404 (unknown request), 409 (cancelled or already decided) and 400
     * (validation).
     */
    async approveRunRequest(requestId, body, decidedBy) {
        const row = await this.customRepositories.rateLimitRequest.getById(requestId);
        if (!row) {
            throw new errors_1.AppError(404, 'Request not found');
        }
        if (row.status !== 'pending') {
            throw await this.requestGoneError(row);
        }
        const note = body.note?.trim() ? body.note.trim() : null;
        if (row.requestKind === 'extra_runs') {
            const asked = row.extraRuns ?? 0;
            const granted = body.grantedRuns ?? asked;
            if (!Number.isInteger(granted) ||
                granted < exports.RUN_REQUEST_MIN_EXTRA_RUNS ||
                granted > asked ||
                granted > exports.RUN_REQUEST_MAX_EXTRA_RUNS) {
                throw new errors_1.AppError(400, `Runs to grant must be a whole number between ${exports.RUN_REQUEST_MIN_EXTRA_RUNS} and ${formatRuns(asked)} (the number asked for)`);
            }
            const requester = (await this.n8nRepositories.user.findByIdWithRole(row.requestedBy));
            const firstName = requester?.firstName?.trim() ?? '';
            const decided = await this.customRepositories.rateLimitRequest.approveAsTopup(requestId, { grantedRuns: granted, decisionNote: note, decidedBy }, {
                projectId: row.projectId,
                periodKey: row.periodKey,
                // The note shows on the top-up list; without one, label it as a run-request decision.
                adminComment: note ?? `Approved from ${firstName.length > 0 ? firstName : 'a member'}'s run request`,
            });
            if (!decided) {
                throw await this.requestGoneError(row);
            }
            this.notifyRunRequestDecided(decided, decidedBy);
            return (await this.enrichRunRequests([decided]))[0];
        }
        // limit_increase: granted limits must stay within [current, asked] and be an actual change.
        const project = await this.n8nRepositories.project.findOneBy({ id: row.projectId });
        const kind = project?.type === 'personal' ? 'personal' : 'team';
        const [custom, defaults] = await Promise.all([
            this.customRepositories.projectRateLimit.get(row.projectId),
            this.customRepositories.projectRateLimitDefault.get(kind),
        ]);
        const currentWeekly = custom && !custom.usesDefaultLimits
            ? (custom.weeklyRateLimit ?? defaults?.weeklyRateLimit ?? null)
            : (defaults?.weeklyRateLimit ?? null);
        const currentAnnual = custom && !custom.usesDefaultLimits
            ? (custom.yearlyRateLimit ?? defaults?.yearlyRateLimit ?? null)
            : (defaults?.yearlyRateLimit ?? null);
        const newWeekly = body.newWeeklyLimit ?? null;
        const newAnnual = body.newAnnualLimit ?? null;
        if (row.requestedWeeklyLimit === null && newWeekly !== null) {
            throw new errors_1.AppError(400, 'Only the periods the requester asked about can be changed');
        }
        if (row.requestedAnnualLimit === null && newAnnual !== null) {
            throw new errors_1.AppError(400, 'Only the periods the requester asked about can be changed');
        }
        for (const [label, granted, asked, current] of [
            ['weekly', newWeekly, row.requestedWeeklyLimit, currentWeekly],
            ['annual', newAnnual, row.requestedAnnualLimit, currentAnnual],
        ]) {
            if (granted === null) {
                continue;
            }
            if (!Number.isInteger(granted) || granted < 1) {
                throw new errors_1.AppError(400, `The new ${label} limit must be a whole number of at least 1`);
            }
            if (asked !== null && granted > asked) {
                throw new errors_1.AppError(400, `The new ${label} limit cannot be higher than the ${formatRuns(asked)} asked for`);
            }
            if (current !== null && granted < current) {
                throw new errors_1.AppError(400, `The new ${label} limit cannot be lower than the current limit of ${formatRuns(current)}`);
            }
        }
        if (newWeekly !== null && newAnnual !== null && newAnnual < newWeekly) {
            throw new errors_1.AppError(400, 'The new annual limit must be at least the new weekly limit');
        }
        const isChange = (newWeekly !== null && (currentWeekly === null || newWeekly > currentWeekly)) ||
            (newAnnual !== null && (currentAnnual === null || newAnnual > currentAnnual));
        if (!isChange) {
            throw new errors_1.AppError(400, 'Grant at least one limit above the current values, or deny the request');
        }
        const decided = await this.customRepositories.rateLimitRequest.approveAsLimitChange(requestId, {
            decidedWeeklyLimit: newWeekly,
            decidedAnnualLimit: newAnnual,
            decisionNote: note,
            decidedBy,
        }, { projectId: row.projectId, lastAdminComment: note });
        if (!decided) {
            throw await this.requestGoneError(row);
        }
        this.notifyRunRequestDecided(decided, decidedBy);
        return (await this.enrichRunRequests([decided]))[0];
    }
    /**
     * Denies a pending run request with a required reason (surfaced to the
     * requester verbatim in the decision email). Throws AppError 404 (unknown
     * request), 409 (cancelled or already decided) and 400 (invalid reason).
     */
    async denyRunRequest(requestId, body, decidedBy) {
        const row = await this.customRepositories.rateLimitRequest.getById(requestId);
        if (!row) {
            throw new errors_1.AppError(404, 'Request not found');
        }
        if (row.status !== 'pending') {
            throw await this.requestGoneError(row);
        }
        const reason = body.reason.trim();
        if (reason.length < 10 || reason.length > 500) {
            throw new errors_1.AppError(400, 'Reason must be between 10 and 500 characters');
        }
        const decided = await this.customRepositories.rateLimitRequest.rejectPending(requestId, {
            decisionNote: reason,
            decidedBy,
        });
        if (!decided) {
            throw await this.requestGoneError(row);
        }
        this.notifyRunRequestDecided(decided, decidedBy);
        return (await this.enrichRunRequests([decided]))[0];
    }
    /** Maps a lost decide race (concurrent cancel or second decision) to its 409 message. */
    async requestGoneError(row) {
        const fresh = (await this.customRepositories.rateLimitRequest.getById(row.id)) ?? row;
        if (fresh.status === 'cancelled') {
            return new errors_1.AppError(409, 'This request was cancelled by the requester');
        }
        return new errors_1.AppError(409, 'This request has already been decided');
    }
    /** Resolves an admin display name ("Jordan Lee") from an email, falling back to the email. */
    async resolveUserDisplayName(email) {
        if (!email || email.trim().length === 0) {
            return null;
        }
        try {
            const names = await this.n8nRepositories.user.findUserNamesByEmails([email.trim()]);
            return formatFullName(names.get(email.trim().toLowerCase()), email.trim());
        }
        catch (error) {
            log.warn('Failed to resolve a user display name; falling back to the email', {
                error: error instanceof Error ? error.message : String(error),
            });
            return email.trim();
        }
    }
    /**
     * Enriches request rows for the admin list: project, requester identity and
     * role, usage when sent and now, current effective limits, and the
     * last-top-up / last-limit-change context for the review dialogs. Caches
     * per-project and per-user lookups across rows (the same project or member
     * can appear in several requests).
     */
    async enrichRunRequests(rows) {
        const projectCache = new Map();
        const requesterCache = new Map();
        const roleCache = new Map();
        const limitsCache = new Map();
        const nowKeys = (0, period_1.getCurrentPeriodKeys)();
        const items = await Promise.all(rows.map(async (row) => {
            let project = projectCache.get(row.projectId);
            if (project === undefined) {
                const loaded = await this.n8nRepositories.project.findOneBy({ id: row.projectId });
                project = loaded ? { name: loaded.name, type: loaded.type } : null;
                projectCache.set(row.projectId, project);
            }
            let requester = requesterCache.get(row.requestedBy);
            if (requester === undefined) {
                requester = (await this.n8nRepositories.user.findByIdWithRole(row.requestedBy));
                requesterCache.set(row.requestedBy, requester);
            }
            const roleKey = `${row.requestedBy}:${row.projectId}`;
            let roleLabel = roleCache.get(roleKey);
            if (roleLabel === undefined) {
                const role = await this.n8nRepositories.projectRelation.findProjectRole({
                    userId: row.requestedBy,
                    projectId: row.projectId,
                });
                const slug = (0, project_access_1.extractRoleSlug)(role);
                roleLabel = slug ? (RUN_REQUEST_ROLE_LABELS[slug] ?? slug) : null;
                roleCache.set(roleKey, roleLabel);
            }
            let limits = limitsCache.get(row.projectId);
            if (limits === undefined) {
                const kind = project?.type === 'personal' ? 'personal' : 'team';
                const [custom, defaults, topups] = await Promise.all([
                    this.customRepositories.projectRateLimit.get(row.projectId),
                    this.customRepositories.projectRateLimitDefault.get(kind),
                    this.customRepositories.projectTopup.list(row.projectId, 1, 1),
                ]);
                const latestTopup = topups.rows[0] ?? null;
                limits = {
                    custom,
                    weekly: custom && !custom.usesDefaultLimits
                        ? (custom.weeklyRateLimit ?? defaults?.weeklyRateLimit ?? null)
                        : (defaults?.weeklyRateLimit ?? null),
                    yearly: custom && !custom.usesDefaultLimits
                        ? (custom.yearlyRateLimit ?? defaults?.yearlyRateLimit ?? null)
                        : (defaults?.yearlyRateLimit ?? null),
                    lastTopup: latestTopup
                        ? {
                            amount: latestTopup.amount,
                            periodKey: latestTopup.periodKey,
                            createdAt: latestTopup.createdAt.toISOString(),
                            createdByName: await this.resolveUserDisplayName(latestTopup.createdBy),
                        }
                        : null,
                };
                limitsCache.set(row.projectId, limits);
            }
            // "When sent" usage: the asked week for extra-runs requests, the week
            // the request was filed otherwise; the year always from the filed date.
            const sentKeys = (0, period_1.getCurrentPeriodKeys)(row.createdAt);
            const sentWeeklyKey = row.requestKind === 'extra_runs' ? (row.periodKey ?? sentKeys.weekly) : sentKeys.weekly;
            const [sentCounts, nowCounts] = await Promise.all([
                this.customRepositories.projectExecutionUsage.getCounts(row.projectId, sentWeeklyKey, sentKeys.yearly),
                this.customRepositories.projectExecutionUsage.getCounts(row.projectId, nowKeys.weekly, nowKeys.yearly),
            ]);
            const requesterEmail = requester?.email?.trim() ?? null;
            let lastLimitChange = null;
            if (limits.custom?.updatedAt) {
                lastLimitChange = {
                    at: limits.custom.updatedAt.toISOString(),
                    byName: await this.resolveUserDisplayName(limits.custom.updatedBy),
                };
            }
            return {
                id: row.id,
                projectId: row.projectId,
                projectName: project?.name ?? row.projectId,
                projectType: project?.type ?? 'team',
                requestKind: row.requestKind,
                status: row.status === 'approved'
                    ? 'approved'
                    : row.status === 'cancelled'
                        ? 'cancelled'
                        : row.status === 'rejected'
                            ? 'denied'
                            : 'pending',
                extraRuns: row.extraRuns,
                periodKey: row.periodKey,
                requestedWeeklyLimit: row.requestedWeeklyLimit,
                requestedAnnualLimit: row.requestedAnnualLimit,
                reason: row.reason,
                requestedBy: row.requestedBy,
                requestedByName: formatFullName(requester ?? undefined, requesterEmail),
                requestedByEmail: requesterEmail,
                requestedByRoleLabel: roleLabel,
                createdAt: row.createdAt.toISOString(),
                weeklyUsedWhenSent: sentCounts.weeklyCount,
                yearlyUsedWhenSent: sentCounts.yearlyCount,
                weeklyUsedNow: nowCounts.weeklyCount,
                yearlyUsedNow: nowCounts.yearlyCount,
                currentWeeklyLimit: limits.weekly,
                currentAnnualLimit: limits.yearly,
                lastTopup: limits.lastTopup,
                lastLimitChange,
                ...serializeDecisionFields(row),
                decidedByName: await this.resolveUserDisplayName(row.decidedBy),
            };
        }));
        return items;
    }
    /**
     * Spawns the decision email to the requester (fire-and-forget like the other
     * rate-limit notifications). Supersedes the generic top-up/limits-change
     * notifications: the decision email already spells out what was granted.
     */
    notifyRunRequestDecided(row, decidedBy) {
        if (!this.nodeMailerService) {
            return;
        }
        void (async () => {
            try {
                const context = await this.resolveProjectContext(row.projectId);
                if (!context) {
                    log.warn('Project not found when sending the run-request decision email', { requestId: row.id });
                    return;
                }
                const requester = (await this.n8nRepositories.user.findByIdWithRole(row.requestedBy));
                const to = requester?.email?.trim() ?? null;
                if (!to) {
                    log.warn('No requester email resolved for the run-request decision email', { requestId: row.id });
                    return;
                }
                const decidedByName = await this.resolveUserDisplayName(decidedBy);
                let subject;
                let html;
                if (row.status === 'approved' && row.requestKind === 'extra_runs') {
                    subject = `Your extra-runs request for ${context.projectName} was approved`;
                    html = (0, email_templates_1.renderEmail)('rateLimitRequestTopupApproved', {
                        projectName: context.projectName,
                        amount: formatRuns(row.grantedRuns ?? 0),
                        weekDescription: (0, period_1.describeWeeklyPeriodKey)(row.periodKey ?? '') ?? (row.periodKey ?? ''),
                        adminNote: row.decisionNote ?? undefined,
                        decidedByName,
                        projectUrl: context.projectUrl,
                    });
                }
                else if (row.status === 'approved') {
                    subject = `Your limit-raise request for ${context.projectName} was approved`;
                    html = (0, email_templates_1.renderEmail)('rateLimitRequestLimitsApproved', {
                        projectName: context.projectName,
                        weeklyLimit: row.decidedWeeklyLimit !== null ? formatRuns(row.decidedWeeklyLimit) : 'unchanged',
                        yearlyLimit: row.decidedAnnualLimit !== null ? formatRuns(row.decidedAnnualLimit) : 'unchanged',
                        adminNote: row.decisionNote ?? undefined,
                        decidedByName,
                        projectUrl: context.projectUrl,
                    });
                }
                else {
                    subject = `Your run request for ${context.projectName} was denied`;
                    html = (0, email_templates_1.renderEmail)('rateLimitRequestDenied', {
                        projectName: context.projectName,
                        reason: row.decisionNote ?? '',
                        decidedByName,
                        projectUrl: context.projectUrl,
                    });
                }
                await this.nodeMailerService.sendMail({ to, subject, html });
                log.info('Sent the run-request decision email', { requestId: row.id, status: row.status });
            }
            catch (error) {
                log.error('Failed to send the run-request decision email', {
                    requestId: row.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        })();
    }
    /** Throws AppError 404 when the project does not exist in n8n. */
    async assertProjectExists(projectId) {
        const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
        if (!project) {
            throw new errors_1.AppError(404, 'Project not found');
        }
    }
}
exports.ProjectRateLimitService = ProjectRateLimitService;
