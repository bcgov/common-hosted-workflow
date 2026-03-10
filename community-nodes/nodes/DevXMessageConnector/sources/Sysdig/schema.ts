import { z } from 'zod';

import { IsoTimestampSchema } from '../shared/schema';

export const schema = z
  .object({
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']), // alert.severity [0-7]
    alertName: z.string().min(1), // alert.name
    scope: z.string().min(1).optional(), // alert.scope
    description: z.string().min(1).optional(), // alert.description
    timestamp: IsoTimestampSchema.optional(), // timestamp
    url: z.string().url().optional(), // event.url
  })
  .strict();
