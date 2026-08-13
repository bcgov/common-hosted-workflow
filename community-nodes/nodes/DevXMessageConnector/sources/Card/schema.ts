import { z } from 'zod';

export const adaptiveCardSchema = z
  .object({
    type: z.literal('AdaptiveCard'),
  })
  .passthrough();

export type AdaptiveCardData = z.infer<typeof adaptiveCardSchema>;
