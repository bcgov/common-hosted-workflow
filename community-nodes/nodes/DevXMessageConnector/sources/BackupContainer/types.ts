// See https://github.com/bcgov/backup-container/blob/cacd0e5317597712033496e33934dfac954014a8/docker/backup.logging#L81

export interface BackupContainerPayload {
  projectFriendlyName: string;
  projectName: string;
  statusCode: string; // "INFO", "WARN", or "ERROR"
  message: string;
}
