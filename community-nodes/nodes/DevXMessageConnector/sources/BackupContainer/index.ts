import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { BackupContainerPayload } from './types';

export async function backupContainerTransform(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload =
    typeof rawPayload === 'string'
      ? (JSON.parse(rawPayload) as BackupContainerPayload)
      : (rawPayload as BackupContainerPayload);
  console.log('backup-container', payload);

  // Specific Backup Container transformation logic here
  const transformedJson = {
    text: `Backup Container Alert: ${rawPayload}`,
  };

  return { json: transformedJson };
}
