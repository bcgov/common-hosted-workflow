import { z } from 'zod';

import { isoTimestampSchema } from '../shared/schema';

export const uptimeComMessageContentDataSchema = z
  .object({
    status: z.enum(['up', 'down']),
    service: z.string().min(1),
    downSince: isoTimestampSchema.optional(),
    url: z.string().url().optional(),
  })
  .strict();

export type UptimeComMessageContentData = z.infer<typeof uptimeComMessageContentDataSchema>;
