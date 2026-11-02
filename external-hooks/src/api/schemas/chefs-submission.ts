import { z } from 'zod';

/**
 * POST /chefs/:webhookPath
 *
 * CHEFS Event Subscription payload. `subscriptionEvent` identifies the event type; only
 * `eventSubmission` is forwarded to the n8n webhook (the route gates on it). `formId` /
 * `submissionId` are used to look up a pending resubmission row. Unknown extra fields are allowed.
 */
export const chefsSubmissionCallbackSchema = z.object({
  body: z
    .object({
      subscriptionEvent: z.string().min(1, 'subscriptionEvent is required'),
      formId: z.string().min(1, 'formId is required'),
      submissionId: z.string().min(1, 'submissionId is required'),
    })
    .passthrough(),
  params: z.object({
    webhookPath: z.string().min(1, 'webhookPath is required'),
  }),
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
