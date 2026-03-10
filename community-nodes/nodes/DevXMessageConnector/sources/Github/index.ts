import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { PullRequestOpenedEvent, PullRequestClosedEvent } from './types';

type AllTypes = PullRequestOpenedEvent | PullRequestClosedEvent;

export async function githubTransform(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload = typeof rawPayload === 'string' ? (JSON.parse(rawPayload) as AllTypes) : (rawPayload as AllTypes);
  console.log('github', payload);

  // Specific GitHub transformation logic here
  const transformedJson = {
    text: `GitHub Alert: ${rawPayload}`,
  };

  return { json: transformedJson };
}
