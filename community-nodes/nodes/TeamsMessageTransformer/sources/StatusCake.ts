import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

export async function statusCakeTransform(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const rawPayload = this.getNodeParameter('payload', index);

  console.log('statusCake', JSON.stringify(rawPayload));

  // Specific StatusCake transformation logic here
  const transformedJson = {
    text: `StatusCake Alert: ${rawPayload}`,
  };

  return { json: transformedJson };
}
