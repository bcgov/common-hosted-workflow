import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { GenericMessageContent } from './types';
import type { GenericMessageContentData } from './schema';

export function genericTransform(this: IExecuteFunctions, index: number): GenericMessageContent {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload: GenericMessageContentData =
    typeof rawPayload === 'string'
      ? (JSON.parse(rawPayload) as GenericMessageContentData)
      : (rawPayload as GenericMessageContentData);

  return createGenericMessageContent(payload);
}

export function createGenericMessageContent(data: GenericMessageContentData): GenericMessageContent {
  return {
    kind: 'template',
    template: 'generic',
    data: data,
  };
}
