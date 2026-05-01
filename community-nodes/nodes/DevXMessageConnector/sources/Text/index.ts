import { IExecuteFunctions } from 'n8n-workflow';
import type { TextMessageContent } from './types';
import { safeStringifyPayload } from '../shared/payload';

export function textTransform(this: IExecuteFunctions, index: number): TextMessageContent {
  const rawPayload = this.getNodeParameter('payload', index);
  const payload = safeStringifyPayload(rawPayload);
  return createTextMessageContent(payload);
}

export function createTextMessageContent(text: string): TextMessageContent {
  return {
    kind: 'text',
    text,
  };
}
