import { z } from 'zod';

import { IsoTimestampSchema } from '../shared/schema';

export const sysdigMessageContentDataSchema = z
  .object({
    severity: z.number(),
    state: z.enum(['ACTIVE', 'OK']),
    alertName: z.string().min(1),
    scope: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    timestamp: IsoTimestampSchema.optional(),
    url: z.url().optional(),
  })
  .strict();

export type SysdigMessageContentData = z.infer<typeof sysdigMessageContentDataSchema>;
