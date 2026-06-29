import { z } from 'zod';

export const configResponseSchema = z.object({
  featureFlags: z.record(z.string(), z.boolean()),
});

export type ConfigResponse = z.infer<typeof configResponseSchema>;
