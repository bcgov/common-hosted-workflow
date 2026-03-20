import { IExecuteFunctions } from 'n8n-workflow';
import type { GenericMessageContent } from './types';
import type { GenericMessageContentData } from './schema';
import { safeParsePayload } from '../shared/payload';

export function genericTransform(this: IExecuteFunctions, index: number): GenericMessageContent | null {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload = safeParsePayload<GenericMessageContentData>(rawPayload);
  if (!payload) return null;

  return createGenericMessageContent(payload);
}

export function createGenericMessageContent(data: GenericMessageContentData): GenericMessageContent {
  return {
    kind: 'template',
    template: 'generic',
    data: data,
  };
}
