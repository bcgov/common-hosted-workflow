import { z } from 'zod';

import { isoTimestampSchema } from '../shared/schema';

export const sysdigMessageContentDataSchema = z
  .object({
    severity: z.number().int().min(0).max(7),
    alertName: z.string().min(1).max(200),
    state: z.enum(['active', 'ok']).optional(),
    scope: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    timestamp: isoTimestampSchema.optional(),
    url: z.string().url().optional(),
  })
  .strict();

export type SysdigMessageContentData = z.infer<typeof sysdigMessageContentDataSchema>;
