import { IExecuteFunctions } from 'n8n-workflow';

import { safeParsePayload } from '../shared/payload';
import type { StatusCakeMessageContent, StatusCakePayload } from './types';
import { statusCakeMessageContentDataSchema, type StatusCakeMessageContentData } from './schema';

export function statusCakeTransform(this: IExecuteFunctions, index: number): StatusCakeMessageContent | null {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload = safeParsePayload<StatusCakePayload>(rawPayload);
  if (!payload) return null;

  const data = {
    status: payload.Status.toLocaleLowerCase() === 'up' ? ('up' as const) : ('down' as const),
    testName: payload.Name || 'undefined',
    websiteUrl: payload.URL || undefined,
    statusCode: payload.StatusCode?.toString() || undefined,
    ip: payload.IP || undefined,
    tags: payload.Tags || undefined,
    checkRate: payload.Checkrate?.toString() || undefined,
    testId: payload.TestID?.toString() || undefined,
    method: payload.Method || undefined,
  };

  return createStatusCakeMessageContent(data);
}

export function createStatusCakeMessageContent(data: StatusCakeMessageContentData): StatusCakeMessageContent {
  const validatedData = statusCakeMessageContentDataSchema.parse(data);
  return {
    kind: 'template',
    template: 'statuscake',
    data: validatedData,
  };
}
