import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { ArgoCdPayload } from './types';

export async function argoCdTransform(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const rawPayload = this.getNodeParameter('payload', index);
  const payload =
    typeof rawPayload === 'string' ? (JSON.parse(rawPayload) as ArgoCdPayload) : (rawPayload as ArgoCdPayload);

  console.log('argocd', payload);

  // Specific Argo CD transformation logic here
  const transformedJson = {
    text: `Argo CD Alert: ${rawPayload}`,
  };

  return { json: transformedJson };
}
