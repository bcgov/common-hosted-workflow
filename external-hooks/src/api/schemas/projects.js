'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.denyRunRequestSchema =
  exports.approveRunRequestSchema =
  exports.listRunRequestsSchema =
  exports.cancelRunRequestSchema =
  exports.createRunRequestSchema =
  exports.updateRateLimitDefaultsSchema =
  exports.getRateLimitDefaultsSchema =
  exports.deleteProjectTopupSchema =
  exports.createProjectTopupSchema =
  exports.listProjectTopupsSchema =
  exports.getProjectWorkflowUsageSchema =
  exports.getAdminProjectSchema =
  exports.updateProjectRateLimitSchema =
  exports.deleteProjectTenantSchema =
  exports.updateProjectTenantSchema =
  exports.adminProjectsQuerySchema =
    void 0;
const zod_1 = require('zod');
/** GET /rest/admin/projects — query: page, pageSize, search, and type with defaults. */
exports.adminProjectsQuerySchema = zod_1.z.object({
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(25),
    search: zod_1.z.preprocess((v) => (v === '' ? undefined : v), zod_1.z.string().max(200).optional()),
    type: zod_1.z.preprocess(
      (v) => (v === '' || v === 'all' ? undefined : v),
      zod_1.z.enum(['personal', 'team']).optional(),
    ),
  }),
});
/** PUT /rest/admin/projects/:projectId/tenant — assigns a tenant to a project. */
exports.updateProjectTenantSchema = zod_1.z.object({
  params: zod_1.z.object({
    projectId: zod_1.z.string().min(1),
  }),
  body: zod_1.z.object({
    tenantId: zod_1.z.string().uuid({ message: 'tenantId must be a valid UUID' }),
  }),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** DELETE /rest/admin/projects/:projectId/tenant — removes a tenant mapping from a project. */
exports.deleteProjectTenantSchema = zod_1.z.object({
  params: zod_1.z.object({
    projectId: zod_1.z.string().min(1),
  }),
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/**
 * PUT /rest/admin/projects/:projectId/rate-limit — replaces a project's rate-limit
 * configuration. All body fields are required (full replace); explicit null clears
 * a limit or the admin comment. `usesDefaultLimits` selects the mode: true makes
 * the project follow its scope's saved defaults (the service normalizes the
 * stored limits to nulls), false stores the custom values as given.
 */
exports.updateProjectRateLimitSchema = zod_1.z.object({
  params: zod_1.z.object({
    projectId: zod_1.z.string().min(1),
  }),
  body: zod_1.z.object({
    usesDefaultLimits: zod_1.z.boolean(),
    weeklyRateLimit: zod_1.z.number().int().min(0).max(1_000_000).nullable(),
    yearlyRateLimit: zod_1.z.number().int().min(0).max(100_000_000).nullable(),
    lastAdminComment: zod_1.z.string().max(2000).nullable(),
    stopBehavior: zod_1.z.enum(['hard_stop', 'soft_stop']),
  }),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** GET /rest/admin/projects/:projectId — returns one enriched admin project. */
exports.getAdminProjectSchema = zod_1.z.object({
  params: zod_1.z.object({
    projectId: zod_1.z.string().min(1),
  }),
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** GET /rest/admin/projects/:projectId/workflow-usage — per-workflow current-period usage. */
exports.getProjectWorkflowUsageSchema = zod_1.z.object({
  params: zod_1.z.object({
    projectId: zod_1.z.string().min(1),
  }),
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** GET /rest/admin/projects/:projectId/topups — one page of a project's top-ups. */
exports.listProjectTopupsSchema = zod_1.z.object({
  params: zod_1.z.object({
    projectId: zod_1.z.string().min(1),
  }),
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(4),
  }),
});
/**
 * POST /rest/admin/projects/:projectId/topups — adds a weekly-limit top-up.
 * periodKey must be the current week or a coming week (re-checked against the
 * horizon in the service); adminComment documents the change.
 */
exports.createProjectTopupSchema = zod_1.z.object({
  params: zod_1.z.object({
    projectId: zod_1.z.string().min(1),
  }),
  body: zod_1.z.object({
    periodKey: zod_1.z.string().regex(/^\d{4}-W\d{2}$/, { message: 'periodKey must match the weekly format YYYY-Www' }),
    amount: zod_1.z.number().int().min(1).max(1_000_000),
    adminComment: zod_1.z.string().trim().min(1, { message: 'adminComment is required' }).max(2000),
  }),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** DELETE /rest/admin/projects/:projectId/topups/:topupId — removes a future-week top-up. */
exports.deleteProjectTopupSchema = zod_1.z.object({
  params: zod_1.z.object({
    projectId: zod_1.z.string().min(1),
    topupId: zod_1.z.string().uuid({ message: 'topupId must be a valid UUID' }),
  }),
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/**
 * One scope's default limits. Explicit null clears the default (that scope's
 * projects without their own limits stay uncapped); 0 is allowed the same way
 * as per-project limits (it pauses every uncapped project of the scope).
 */
const rateLimitDefaultsScopeSchema = zod_1.z
  .object({
    weeklyRateLimit: zod_1.z.number().int().min(0).max(1_000_000).nullable(),
    yearlyRateLimit: zod_1.z.number().int().min(0).max(100_000_000).nullable(),
  })
  .refine(
    (scope) =>
      scope.weeklyRateLimit === null ||
      scope.yearlyRateLimit === null ||
      scope.yearlyRateLimit >= scope.weeklyRateLimit,
    { message: 'yearlyRateLimit must be at least the weeklyRateLimit' },
  );
/** GET /rest/admin/projects/rate-limit-defaults — saved per-scope defaults. */
exports.getRateLimitDefaultsSchema = zod_1.z.object({
  params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** PUT /rest/admin/projects/rate-limit-defaults — replaces both scopes' defaults atomically. */
exports.updateRateLimitDefaultsSchema = zod_1.z.object({
  params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  body: zod_1.z.object({
    team: rateLimitDefaultsScopeSchema,
    personal: rateLimitDefaultsScopeSchema,
  }),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/**
 * POST /ui-api/projects/:projectId/run-requests — a member submits a
 * "Request more runs" entry: either a one-week top-up (`extra_runs`, with the
 * amount and target week) or a lasting limit raise (`limit_increase`, with
 * one or both proposed limits). Field-level bounds mirror the dialog copy;
 * kind/field coherence and the week horizon are enforced by the service.
 */
exports.createRunRequestSchema = zod_1.z.object({
  params: zod_1.z.object({
    projectId: zod_1.z.string().min(1),
  }),
  body: zod_1.z.object({
    requestKind: zod_1.z.enum(['extra_runs', 'limit_increase']),
    extraRuns: zod_1.z.number().int().min(100).max(50_000).nullable().optional(),
    periodKey: zod_1.z
      .string()
      .regex(/^\d{4}-W\d{2}$/, { message: 'periodKey must match the weekly format YYYY-Www' })
      .nullable()
      .optional(),
    requestedWeeklyLimit: zod_1.z.number().int().min(1).max(1_000_000).nullable().optional(),
    requestedAnnualLimit: zod_1.z.number().int().min(1).max(100_000_000).nullable().optional(),
    reason: zod_1.z.string().trim().min(1, { message: 'reason is required' }).max(500),
  }),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** DELETE /ui-api/projects/:projectId/run-requests/:requestId — cancels the requester's own pending request. */
exports.cancelRunRequestSchema = zod_1.z.object({
  params: zod_1.z.object({
    projectId: zod_1.z.string().min(1),
    requestId: zod_1.z.string().uuid({ message: 'requestId must be a valid UUID' }),
  }),
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** GET /ui-api/admin/projects/run-requests — admin review queue (status filter, search, pagination). */
exports.listRunRequestsSchema = zod_1.z.object({
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.object({
    status: zod_1.z.enum(['pending', 'approved', 'denied', 'cancelled', 'all']).default('pending'),
    search: zod_1.z.preprocess((v) => (v === '' ? undefined : v), zod_1.z.string().max(200).optional()),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(25),
  }),
});
/** POST /ui-api/admin/projects/run-requests/:requestId/approve — approves (and fulfills) a pending request. */
exports.approveRunRequestSchema = zod_1.z.object({
  params: zod_1.z.object({
    requestId: zod_1.z.string().uuid({ message: 'requestId must be a valid UUID' }),
  }),
  body: zod_1.z.object({
    /** extra_runs: runs to grant (defaults to the asked amount; may be lowered, never raised). */
    grantedRuns: zod_1.z.number().int().min(100).max(50_000).nullable().optional(),
    /** limit_increase: the new limits (only the asked periods may change). */
    newWeeklyLimit: zod_1.z.number().int().min(1).max(1_000_000).nullable().optional(),
    newAnnualLimit: zod_1.z.number().int().min(1).max(100_000_000).nullable().optional(),
    /** Optional note shown to the requester on the project page and in the email. */
    note: zod_1.z.string().trim().max(500).nullable().optional(),
  }),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** POST /ui-api/admin/projects/run-requests/:requestId/deny — denies a pending request with a required reason. */
exports.denyRunRequestSchema = zod_1.z.object({
  params: zod_1.z.object({
    requestId: zod_1.z.string().uuid({ message: 'requestId must be a valid UUID' }),
  }),
  body: zod_1.z.object({
    reason: zod_1.z.string().trim().min(10, { message: 'reason must be between 10 and 500 characters' }).max(500),
  }),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
