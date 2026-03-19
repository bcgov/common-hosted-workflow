import { z } from 'zod';

import { IsoTimestampSchema } from '../shared/schema';

export const uptimeComMessageContentDataSchema = z
  .object({
    status: z.enum(['up', 'down']),
    service: z.string().min(1),
    downSince: IsoTimestampSchema.optional(),
    url: z.string().url().optional(),
  })
  .strict();

export type UptimeComMessageContentData = z.infer<typeof uptimeComMessageContentDataSchema>;
