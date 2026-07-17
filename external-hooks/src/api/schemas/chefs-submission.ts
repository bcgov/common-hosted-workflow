import { z } from 'zod';

/** POST /chefs/submissions/callback */
export const chefsSubmissionCallbackSchema = z.object({
  body: z.object({
    formId: z.string().min(1, 'formId is required'),
    submissionId: z.string().min(1, 'submissionId is required'),
  }),
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});

/** POST /chefs/submissions/register */
export const chefsSubmissionRegisterSchema = z.object({
  body: z.object({
    executionId: z.string().min(1, 'executionId is required'),
    formId: z.string().min(1, 'formId is required'),
    submissionId: z.string().min(1, 'submissionId is required'),
    resumeUrl: z.string().url('resumeUrl must be a valid URL'),
  }),
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});
