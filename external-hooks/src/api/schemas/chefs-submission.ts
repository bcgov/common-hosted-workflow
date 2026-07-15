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
