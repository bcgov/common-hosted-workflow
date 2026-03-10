import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { MonitoringPayload } from './types';

export async function uptimeComTransform(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload =
    typeof rawPayload === 'string' ? (JSON.parse(rawPayload) as MonitoringPayload) : (rawPayload as MonitoringPayload);

  console.log('uptimeCom', payload);

  // Specific Uptime.Com transformation logic here
  const transformedJson = {
    text: `Uptime.Com Alert: ${rawPayload}`,
  };

  return { json: transformedJson };
}
