import { z } from 'zod';

/** GET /rest/admin/projects — query: page and pageSize with defaults. */
export const adminProjectsQuerySchema = z.object({
  body: z.record(z.string(), z.unknown()).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
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
