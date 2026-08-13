import { z } from 'zod';

import { isoTimestampSchema } from '../shared/schema';

const SysdigStateSchema = z
  .enum(['ACTIVE', 'OK', 'active', 'ok'])
  .transform((state): 'ACTIVE' | 'OK' => state.toUpperCase() as 'ACTIVE' | 'OK');

export const sysdigMessageContentDataSchema = z
  .object({
    severity: z.number().int().min(0).max(7), // alert.severity (0=critical, 1=high, 2-3=medium, 4-5=low, 6-7=info)
    alertName: z.string().min(1).max(200), // alert.name
    subject: z.string().min(1).max(500).optional(), // alert.subject
    state: SysdigStateSchema.optional(), // state; legacy lowercase values are normalized
    scope: z.string().min(1).optional(), // alert.scope
    description: z.string().min(1).optional(), // alert.description
    timestamp: isoTimestampSchema.optional(), // timestamp
    url: z.string().url().optional(), // alert.editUrl
  })
  .strict();

export type SysdigMessageContentData = z.infer<typeof sysdigMessageContentDataSchema>;
