import { z } from 'zod';

const genericSeveritySchema = z.enum(['critical', 'warning', 'info', 'success', 'error', 'debug', 'unknown', 'trace']);

export const genericMessageContentDataSchema = z
  .object({
    title: z.string().min(1).max(200),
    body: z.string().max(2000).optional(),
    severity: genericSeveritySchema.optional(),
    url: z.string().url().optional(),
    urlLabel: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
  })
  .strict();

export type GenericMessageContentData = z.infer<typeof genericMessageContentDataSchema>;
