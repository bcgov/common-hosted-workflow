import { IExecuteFunctions } from 'n8n-workflow';
import type { UptimeComAlertPayload, UptimeComMessageContent } from './types';
import { uptimeComMessageContentDataSchema, type UptimeComMessageContentData } from './schema';
import { formatToIsoTimestamp } from '../shared/datetime';
import { safeParsePayload } from '../shared/payload';

export function uptimeComTransform(this: IExecuteFunctions, index: number): UptimeComMessageContent | null {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload = safeParsePayload<UptimeComAlertPayload>(rawPayload);
  if (!payload) return null;

  const data = {
    status: payload.data.alert.is_up ? ('up' as const) : ('down' as const),
    service: payload.data.service.display_name,
    downSince: formatToIsoTimestamp(payload.data.alert.created_at),
    url: payload.data.links.alert_details,
  };

  return createUptimeComMessageContent(data);
}

export function createUptimeComMessageContent(data: UptimeComMessageContentData): UptimeComMessageContent {
  const validatedData = uptimeComMessageContentDataSchema.parse(data);
  return {
    kind: 'template',
    template: 'uptime',
    data: validatedData,
  };
}
