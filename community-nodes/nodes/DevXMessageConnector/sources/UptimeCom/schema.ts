import { z } from 'zod';

import { IsoTimestampSchema } from '../shared/schema';

export const schema = z
  .object({
    status: z.enum(['up', 'degraded', 'down']), // degraded??
    service: z.string().min(1), // payload.data.service.name | payload.data.service.display_name
    responseTimeMs: z.number().nonnegative().optional(), // ??
    downSince: IsoTimestampSchema.optional(), // ??
    url: z.string().url().optional(), // site_url | postback_url
  })
  .strict();
