import { z } from 'zod';

/** GET /rest/admin/projects — query: page, pageSize, search, and type with defaults. */
export const adminProjectsQuerySchema = z.object({
  body: z.record(z.string(), z.unknown()).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    search: z.preprocess((v) => (v === '' ? undefined : v), z.string().max(200).optional()),
    type: z.preprocess((v) => (v === '' || v === 'all' ? undefined : v), z.enum(['personal', 'team']).optional()),
  }),
});

/** PUT /rest/admin/projects/:projectId/tenant — assigns a tenant to a project. */
export const updateProjectTenantSchema = z.object({
  params: z.object({
    projectId: z.string().min(1),
  }),
  body: z.object({
    tenantId: z.string().uuid({ message: 'tenantId must be a valid UUID' }),
  }),
  query: z.record(z.string(), z.unknown()).optional(),
});

/** DELETE /rest/admin/projects/:projectId/tenant — removes a tenant mapping from a project. */
export const deleteProjectTenantSchema = z.object({
  params: z.object({
    projectId: z.string().min(1),
  }),
  body: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});

/**
 * PUT /rest/admin/projects/:projectId/rate-limit — replaces a project's rate-limit
 * configuration. All body fields are required (full replace); explicit null clears
 * a limit or the admin comment. `usesDefaultLimits` selects the mode: true makes
 * the project follow its scope's saved defaults (the service normalizes the
 * stored limits to nulls), false stores the custom values as given.
 */
export const updateProjectRateLimitSchema = z.object({
  params: z.object({
    projectId: z.string().min(1),
  }),
  body: z.object({
    usesDefaultLimits: z.boolean(),
    weeklyRateLimit: z.number().int().min(0).max(1_000_000).nullable(),
    yearlyRateLimit: z.number().int().min(0).max(100_000_000).nullable(),
    lastAdminComment: z.string().max(2000).nullable(),
    stopBehavior: z.enum(['hard_stop', 'soft_stop']),
  }),
  query: z.record(z.string(), z.unknown()).optional(),
});

/** GET /rest/admin/projects/:projectId — returns one enriched admin project. */
export const getAdminProjectSchema = z.object({
  params: z.object({
    projectId: z.string().min(1),
  }),
  body: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});

/** GET /rest/admin/projects/:projectId/workflow-usage — per-workflow current-period usage. */
export const getProjectWorkflowUsageSchema = z.object({
  params: z.object({
    projectId: z.string().min(1),
  }),
  body: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});

/** GET /rest/admin/projects/:projectId/topups — one page of a project's top-ups. */
export const listProjectTopupsSchema = z.object({
  params: z.object({
    projectId: z.string().min(1),
  }),
  body: z.record(z.string(), z.unknown()).optional(),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(4),
  }),
});

/**
 * POST /rest/admin/projects/:projectId/topups — adds a weekly-limit top-up.
 * periodKey must be the current week or a coming week (re-checked against the
 * horizon in the service); adminComment documents the change.
 */
export const createProjectTopupSchema = z.object({
  params: z.object({
    projectId: z.string().min(1),
  }),
  body: z.object({
    periodKey: z.string().regex(/^\d{4}-W\d{2}$/, { message: 'periodKey must match the weekly format YYYY-Www' }),
    amount: z.number().int().min(1).max(1_000_000),
    adminComment: z.string().trim().min(1, { message: 'adminComment is required' }).max(2000),
  }),
  query: z.record(z.string(), z.unknown()).optional(),
});

/** DELETE /rest/admin/projects/:projectId/topups/:topupId — removes a future-week top-up. */
export const deleteProjectTopupSchema = z.object({
  params: z.object({
    projectId: z.string().min(1),
    topupId: z.string().uuid({ message: 'topupId must be a valid UUID' }),
  }),
  body: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});

/**
 * One scope's default limits. Explicit null clears the default (that scope's
 * projects without their own limits stay uncapped); 0 is allowed the same way
 * as per-project limits (it pauses every uncapped project of the scope).
 */
const rateLimitDefaultsScopeSchema = z
  .object({
    weeklyRateLimit: z.number().int().min(0).max(1_000_000).nullable(),
    yearlyRateLimit: z.number().int().min(0).max(100_000_000).nullable(),
  })
  .refine(
    (scope) =>
      scope.weeklyRateLimit === null ||
      scope.yearlyRateLimit === null ||
      scope.yearlyRateLimit >= scope.weeklyRateLimit,
    { message: 'yearlyRateLimit must be at least the weeklyRateLimit' },
  );

/** GET /rest/admin/projects/rate-limit-defaults — saved per-scope defaults. */
export const getRateLimitDefaultsSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});

/** PUT /rest/admin/projects/rate-limit-defaults — replaces both scopes' defaults atomically. */
export const updateRateLimitDefaultsSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  body: z.object({
    team: rateLimitDefaultsScopeSchema,
    personal: rateLimitDefaultsScopeSchema,
  }),
  query: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /ui-api/projects/:projectId/run-requests — a member submits a
 * "Request more runs" entry: either a one-week top-up (`extra_runs`, with the
 * amount and target week) or a lasting limit raise (`limit_increase`, with
 * one or both proposed limits). Field-level bounds mirror the dialog copy;
 * kind/field coherence and the week horizon are enforced by the service.
 */
export const createRunRequestSchema = z.object({
  params: z.object({
    projectId: z.string().min(1),
  }),
  body: z.object({
    requestKind: z.enum(['extra_runs', 'limit_increase']),
    extraRuns: z.number().int().min(100).max(50_000).nullable().optional(),
    periodKey: z
      .string()
      .regex(/^\d{4}-W\d{2}$/, { message: 'periodKey must match the weekly format YYYY-Www' })
      .nullable()
      .optional(),
    requestedWeeklyLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
    requestedAnnualLimit: z.number().int().min(1).max(100_000_000).nullable().optional(),
    reason: z.string().trim().min(1, { message: 'reason is required' }).max(500),
  }),
  query: z.record(z.string(), z.unknown()).optional(),
});

/** DELETE /ui-api/projects/:projectId/run-requests/:requestId — cancels the requester's own pending request. */
export const cancelRunRequestSchema = z.object({
  params: z.object({
    projectId: z.string().min(1),
    requestId: z.string().uuid({ message: 'requestId must be a valid UUID' }),
  }),
  body: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});

/** GET /ui-api/admin/projects/run-requests — admin review queue (status filter, search, pagination). */
export const listRunRequestsSchema = z.object({
  body: z.record(z.string(), z.unknown()).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.object({
    status: z.enum(['pending', 'approved', 'denied', 'cancelled', 'all']).default('pending'),
    search: z.preprocess((v) => (v === '' ? undefined : v), z.string().max(200).optional()),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
});

/** POST /ui-api/admin/projects/run-requests/:requestId/approve — approves (and fulfills) a pending request. */
export const approveRunRequestSchema = z.object({
  params: z.object({
    requestId: z.string().uuid({ message: 'requestId must be a valid UUID' }),
  }),
  body: z.object({
    /** extra_runs: runs to grant (defaults to the asked amount; may be lowered, never raised). */
    grantedRuns: z.number().int().min(100).max(50_000).nullable().optional(),
    /** limit_increase: the new limits (only the asked periods may change). */
    newWeeklyLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
    newAnnualLimit: z.number().int().min(1).max(100_000_000).nullable().optional(),
    /** Optional note shown to the requester on the project page and in the email. */
    note: z.string().trim().max(500).nullable().optional(),
  }),
  query: z.record(z.string(), z.unknown()).optional(),
});

/** POST /ui-api/admin/projects/run-requests/:requestId/deny — denies a pending request with a required reason. */
export const denyRunRequestSchema = z.object({
  params: z.object({
    requestId: z.string().uuid({ message: 'requestId must be a valid UUID' }),
  }),
  body: z.object({
    reason: z.string().trim().min(10, { message: 'reason must be between 10 and 500 characters' }).max(500),
  }),
  query: z.record(z.string(), z.unknown()).optional(),
});
