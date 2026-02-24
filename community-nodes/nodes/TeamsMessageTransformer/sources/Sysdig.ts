import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

export async function sysdigTransform(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const rawPayload = this.getNodeParameter('payload', index);

  console.log('sysdig', JSON.stringify(rawPayload));

  // Specific Sysdig transformation logic here
  const transformedJson = {
    text: `Sysdig Alert: ${rawPayload}`,
  };

  return { json: transformedJson };
}
