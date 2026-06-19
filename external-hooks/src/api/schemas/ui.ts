import { z } from 'zod';
import { trimString } from '../utils/string';

export const shareWorkflowSchema = z.object({
  params: z.object({
    workflowId: z.string().trim().min(1),
  }),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z
    .object({
      email: z.unknown(),
    })
    .transform((body) => ({
      email: trimString(body.email),
    }))
    .refine((body) => Boolean(body.email), { message: 'Missing email in request body.' }),
});

export const shareWorkflowResponseSchema = z.object({
  workflowId: z.string(),
  sharedWithEmail: z.string(),
});

export const unshareWorkflowSchema = z.object({
  params: z.object({
    workflowId: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
  }),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
});

export const unshareWorkflowResponseSchema = z.object({
  workflowId: z.string(),
  projectId: z.string(),
});
