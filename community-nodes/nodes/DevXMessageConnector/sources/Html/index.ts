import { IExecuteFunctions } from 'n8n-workflow';
import type { HtmlMessageContent } from './types';

export function htmlTransform(this: IExecuteFunctions, index: number): HtmlMessageContent {
  const rawPayload = this.getNodeParameter('payload', index);
  const payload = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
  return createHtmlMessageContent(payload);
}

export function createHtmlMessageContent(html: string): HtmlMessageContent {
  return {
    kind: 'html',
    text: html,
  };
}
