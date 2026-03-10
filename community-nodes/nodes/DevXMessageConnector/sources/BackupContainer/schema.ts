import { z } from 'zod';

export const schema = z
  .object({
    status: z.enum(['success', 'warning', 'failed']), // statusCode from  "INFO", "WARN", or "ERROR"
    database: z.string().min(1), // ??
    duration: z.string().min(1).optional(), // ??
    size: z.string().min(1).optional(), // ??
    message: z.string().min(1).optional(), // message
    container: z.string().min(1).optional(), // ?? projectName | projectFriendlyName
  })
  .strict();
