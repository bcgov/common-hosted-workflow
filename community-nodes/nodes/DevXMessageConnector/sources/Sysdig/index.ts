import { IExecuteFunctions } from 'n8n-workflow';
import type { SysdigAlertPayload, SysdigMessageContent } from './types';
import type { SysdigMessageContentData } from './schema';
import { formatToIsoTimestamp } from '../shared/datetime';
import { safeParsePayload } from '../shared/payload';

export function sysdigTransform(this: IExecuteFunctions, index: number): SysdigMessageContent | null {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload = safeParsePayload<SysdigAlertPayload>(rawPayload);
  if (!payload) return null;

  const data = {
    severity: payload.alert.severity,
    state: payload.state,
    alertName: payload.alert.name,
    scope: payload.alert.scope ?? undefined,
    description: payload.alert.description ?? undefined,
    timestamp: formatToIsoTimestamp(payload.timestamp),
    url: payload.alert.editUrl,
  };

  return createSysdigMessageContent(data);
}

export function createSysdigMessageContent(data: SysdigMessageContentData): SysdigMessageContent {
  return {
    kind: 'template',
    template: 'sysdig',
    data,
  };
}
