import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

export async function uptimeComTransform(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const rawPayload = this.getNodeParameter('payload', index);

  console.log('uptimeCom', JSON.stringify(rawPayload));

  // Specific Uptime.Com transformation logic here
  const transformedJson = {
    text: `Uptime.Com Alert: ${rawPayload}`,
  };

  return { json: transformedJson };
}
