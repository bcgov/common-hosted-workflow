import { z } from 'zod';

export const schema = z
  .object({
    title: z.string().min(1), // text | attachments[0].title
    body: z.string().max(2000).optional(), // ??
    severity: z.enum(['critical', 'warning', 'info', 'success']).optional(), // ??
    url: z.string().url().optional(), // ??
    urlLabel: z.string().min(1).optional(), // ??
    source: z.string().min(1).optional(), // ??
  })
  .strict();
