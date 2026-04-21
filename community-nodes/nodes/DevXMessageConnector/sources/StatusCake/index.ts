import { IExecuteFunctions } from 'n8n-workflow';

import { safeParsePayload } from '../shared/payload';
import { createUptimeComMessageContent } from '../UptimeCom';
import type { UptimeComMessageContent } from '../UptimeCom/types';
import type { StatusCakePayload } from './types';

export function statusCakeTransform(this: IExecuteFunctions, index: number): UptimeComMessageContent | null {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload = safeParsePayload<StatusCakePayload>(rawPayload);
  if (!payload) return null;

  return createUptimeComMessageContent({
    status: payload.Status.toLowerCase() as 'up' | 'down',
    service: payload.Name,
  });
}
