import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

export async function backupContainerTransform(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const rawPayload = this.getNodeParameter('payload', index);

  console.log('backupContainer', JSON.stringify(rawPayload));

  // Specific BackupContainer transformation logic here
  const transformedJson = {
    text: `BackupContainer Alert: ${rawPayload}`,
  };

  return { json: transformedJson };
}
