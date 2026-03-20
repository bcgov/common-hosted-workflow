import { z } from 'zod';

export const genericMessageContentDataSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().max(2000).optional(),
    severity: z.enum(['critical', 'warning', 'info', 'success']).optional(),
    url: z.string().url().optional(),
    urlLabel: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
  })
  .strict();

export type GenericMessageContentData = z.infer<typeof genericMessageContentDataSchema>;
