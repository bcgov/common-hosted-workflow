import { IExecuteFunctions } from 'n8n-workflow';
import type { UptimeComAlertPayload, UptimeComMessageContent } from './types';
import type { UptimeComMessageContentData } from './schema';
import { formatToIsoTimestamp } from '../shared/datetime';

export function uptimeComTransform(this: IExecuteFunctions, index: number): UptimeComMessageContent {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload: UptimeComAlertPayload =
    typeof rawPayload === 'string'
      ? (JSON.parse(rawPayload) as UptimeComAlertPayload)
      : (rawPayload as UptimeComAlertPayload);

  const data = {
    status: payload.data.alert.is_up ? ('up' as const) : ('down' as const),
    service: payload.data.service.display_name,
    downSince: formatToIsoTimestamp(payload.data.alert.created_at),
    url: payload.data.links.alert_details,
  };

  return createUptimeComMessageContent(data);
}

export function createUptimeComMessageContent(data: UptimeComMessageContentData): UptimeComMessageContent {
  return {
    kind: 'template',
    template: 'uptime',
    data,
  };
}
