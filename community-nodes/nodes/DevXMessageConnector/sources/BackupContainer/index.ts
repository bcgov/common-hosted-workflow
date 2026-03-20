import { IExecuteFunctions } from 'n8n-workflow';
import type { BackupContainerPayload, BackupContainerMessageContent } from './types';
import type { BackupContainerMessageContentData } from './schema';

export function backupContainerTransform(this: IExecuteFunctions, index: number): BackupContainerMessageContent {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload: BackupContainerPayload =
    typeof rawPayload === 'string'
      ? (JSON.parse(rawPayload) as BackupContainerPayload)
      : (rawPayload as BackupContainerPayload);

  const data = {
    status: payload.statusCode.toLowerCase() as 'info' | 'warn' | 'error',
    projectName: payload.projectName,
    projectFriendlyName: payload.projectFriendlyName,
    message: payload.message,
  };

  return createBackupContainerMessageContent(data);
}

export function createBackupContainerMessageContent(
  data: BackupContainerMessageContentData,
): BackupContainerMessageContent {
  return {
    kind: 'template',
    template: 'db_backup',
    data,
  };
}
