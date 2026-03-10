import { z } from 'zod';

import { IsoTimestampSchema } from '../shared/schema';

export const schema = z
  .object({
    event: z.enum(['sync_succeeded', 'sync_failed', 'out_of_sync']),
    application: z.string().min(1), // ??
    syncStatus: z.enum(['Synced', 'OutOfSync', 'Unknown']).optional(), // ??
    healthStatus: z.enum(['Healthy', 'Degraded', 'Progressing', 'Missing', 'Suspended', 'Unknown']).optional(), // ??
    revision: z.string().min(1).optional(), // ??
    project: z.string().min(1).optional(), // ??
    target: z.string().min(1).optional(), // ??
    timestamp: IsoTimestampSchema.optional(), // ??
    message: z.string().min(1).optional(), // ??
    url: z.string().url().optional(), // ??
  })
  .strict();
