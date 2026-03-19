import { z } from 'zod';

export const backupContainerMessageContentDataSchema = z
  .object({
    status: z.enum(['info', 'warn', 'error']),
    projectName: z.string().min(1),
    projectFriendlyName: z.string().min(1),
    message: z.string().min(1).optional(),
  })
  .strict();

export type BackupContainerMessageContentData = z.infer<typeof backupContainerMessageContentDataSchema>;
