import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

export async function argoCdTransform(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const rawPayload = this.getNodeParameter('payload', index);

  console.log('github', JSON.stringify(rawPayload));

  // Specific GitHub transformation logic here
  const transformedJson = {
    text: `GitHub Alert: ${rawPayload}`,
  };

  return { json: transformedJson };
}
