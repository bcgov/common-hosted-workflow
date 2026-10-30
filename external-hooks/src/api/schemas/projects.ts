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
 * a limit or the admin comment.
 */
export const updateProjectRateLimitSchema = z.object({
  params: z.object({
    projectId: z.string().min(1),
  }),
  body: z.object({
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
