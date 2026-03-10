import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { RocketChatPayload } from './types';

export async function rocketChatTransform(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const rawPayload = this.getNodeParameter('payload', index);
  const payload =
    typeof rawPayload === 'string' ? (JSON.parse(rawPayload) as RocketChatPayload) : (rawPayload as RocketChatPayload);

  console.log('rocket-chat', payload);

  // Specific RocketChat transformation logic here
  const transformedJson = {
    text: `RocketChat Alert: ${rawPayload}`,
  };

  return { json: transformedJson };
}
