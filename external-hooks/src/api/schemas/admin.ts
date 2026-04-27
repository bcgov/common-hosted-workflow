import { z } from 'zod';
import { trimString } from '../utils/string';

export const getUserProjectSchema = z.object({
  params: z.object({
    email: z.string().min(1),
  }),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
});

export const associateWorkflowSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z
    .object({
      workflowId: z.unknown(),
      projectId: z.unknown(),
      singleOwner: z.boolean().optional(),
    })
    .transform((b) => ({
      workflowId: trimString(b.workflowId),
      projectId: trimString(b.projectId),
      singleOwner: b.singleOwner === true,
    }))
    .refine((b) => Boolean(b.workflowId && b.projectId), {
      message: 'Missing workflowId or projectId in request body.',
    }),
});

export const associateCredentialSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z
    .object({
      credentialId: z.unknown(),
      projectId: z.unknown(),
      singleOwner: z.boolean().optional(),
    })
    .transform((b) => ({
      credentialId: trimString(b.credentialId),
      projectId: trimString(b.projectId),
      singleOwner: b.singleOwner === true,
    }))
    .refine((b) => Boolean(b.credentialId && b.projectId), {
      message: 'Missing credentialId or projectId in request body.',
    }),
});

export const tenantProjectRelationSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z
    .object({
      tenantId: z.string().optional(),
      tenant_id: z.string().optional(),
      projectId: z.string().optional(),
      project_id: z.string().optional(),
    })
    .transform((b) => ({
      tenantId: trimString(b.tenantId ?? b.tenant_id),
      projectId: trimString(b.projectId ?? b.project_id),
    }))
    .refine((b) => Boolean(b.tenantId && b.projectId), {
      message: 'Missing tenantId or projectId in request body.',
    }),
});

export const getUserProjectResponseSchema = z.object({
  user: z.unknown(),
  project: z.unknown(),
});

export const associateWorkflowResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const associateCredentialResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const tenantProjectCreatedResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const tenantProjectExistsResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});
