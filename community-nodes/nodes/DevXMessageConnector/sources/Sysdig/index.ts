import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { SysdigAlertPayload } from './types';

export async function sysdigTransform(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload =
    typeof rawPayload === 'string'
      ? (JSON.parse(rawPayload) as SysdigAlertPayload)
      : (rawPayload as SysdigAlertPayload);

  console.log('sysdig', payload);

  // Specific Sysdig transformation logic here
  const transformedJson = {
    text: `Sysdig Alert: ${rawPayload}`,
  };

  return { json: transformedJson };
}
