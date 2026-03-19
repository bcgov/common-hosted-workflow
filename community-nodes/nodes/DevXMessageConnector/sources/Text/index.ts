import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { TextMessageContent } from './types';

export function textTransform(this: IExecuteFunctions, index: number): TextMessageContent {
  const rawPayload = this.getNodeParameter('payload', index);
  const payload = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
  return createTextMessageContent(payload);
}

export function createTextMessageContent(text: string): TextMessageContent {
  return {
    kind: 'text',
    text,
  };
}
