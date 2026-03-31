import { IExecuteFunctions } from 'n8n-workflow';
import type { SysdigAlertPayload, SysdigMessageContent } from './types';
import { sysdigMessageContentDataSchema, type SysdigMessageContentData } from './schema';

import { formatToIsoTimestamp } from '../shared/datetime';
import { safeParsePayload } from '../shared/payload';

export function sysdigTransform(this: IExecuteFunctions, index: number): SysdigMessageContent | null {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload = safeParsePayload<SysdigAlertPayload>(rawPayload);
  if (!payload) return null;

  const data = {
    severity: payload.alert.severity,
    state: (payload.state ?? '').toLowerCase() as 'active' | 'ok',
    alertName: payload.alert.name,
    scope: payload.alert.scope ?? undefined,
    description: payload.alert.description ?? undefined,
    timestamp: formatToIsoTimestamp(payload.timestamp),
    url: payload.alert.editUrl,
  };

  return createSysdigMessageContent(data);
}

export function createSysdigMessageContent(data: SysdigMessageContentData): SysdigMessageContent {
  const validatedData = sysdigMessageContentDataSchema.parse(data);
  return {
    kind: 'template',
    template: 'sysdig',
    data: validatedData,
  };
}
