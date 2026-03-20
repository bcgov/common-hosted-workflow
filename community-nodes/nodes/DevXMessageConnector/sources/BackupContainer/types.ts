// See https://github.com/bcgov/backup-container/blob/cacd0e5317597712033496e33934dfac954014a8/docker/backup.logging#L81

import type { BackupContainerMessageContentData } from './schema';

export interface BackupContainerPayload {
  projectFriendlyName: string;
  projectName: string;
  statusCode: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

export interface BackupContainerMessageContent {
  kind: 'template';
  template: 'db_backup';
  data: BackupContainerMessageContentData;
}
