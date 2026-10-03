import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export async function includeNotifyAuth(
  this: IExecuteSingleFunctions,
  requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
  const resource = this.getNodeParameter('resource', '');
  const operation = this.getNodeParameter('operation', '');

  // Service health is public (@Public(), no auth). Skip header injection entirely
  // so health probes send no credential material. The request URL is still built
  // from the credential's Base URL (requestDefaults baseURL), so validate it here
  // to fail with a clear message instead of a cryptic "Invalid URL".
  const assertBaseUrl = (value: unknown): string => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new NodeOperationError(
        this.getNode(),
        'Base URL (baseUrl) must be set in the Notify API credential, e.g. https://notify-api.example.ca',
      );
    }
    const trimmed = value.trim();
    try {
      const parsed = new URL(trimmed);
      if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.host.length === 0) {
        throw new Error('not http(s)');
      }
    } catch {
      throw new NodeOperationError(
        this.getNode(),
        'Base URL (baseUrl) must be an absolute http(s) URL including the scheme, e.g. https://notify-api.example.ca',
      );
    }
    // Strip trailing slashes so baseURL + path never produces a double slash.
    return trimmed.replace(/\/+$/, '');
  };

  if (resource === 'service' && operation === 'checkHealth') {
    const healthCredentials = await this.getCredentials('notifyApi');
    requestOptions.baseURL = assertBaseUrl(healthCredentials?.baseUrl);
    return requestOptions;
  }

  const supported =
    (resource === 'send' &&
      (operation === 'sendNotification' ||
        operation === 'sendEmail' ||
        operation === 'sendSms' ||
        operation === 'cancelOrReschedule')) ||
    (resource === 'notificationStatus' &&
      (operation === 'listNotificationRequests' ||
        operation === 'listDeliveryRecords' ||
        operation === 'getDeliveryRecords')) ||
    (resource === 'templates' &&
      (operation === 'listTemplates' ||
        operation === 'createTemplate' ||
        operation === 'getTemplate' ||
        operation === 'updateTemplate' ||
        operation === 'deleteTemplate' ||
        operation === 'previewTemplate')) ||
    (resource === 'webhooks' &&
      (operation === 'registerCallback' || operation === 'updateCallback' || operation === 'deleteCallback'));
  if (!supported) {
    throw new NodeOperationError(this.getNode(), 'Unsupported Notify resource/operation selection');
  }

  const requireNonBlank = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new NodeOperationError(this.getNode(), `${label} must be a nonblank string`);
    }
    return value;
  };

  const parseJsonBody = (value: unknown, label: string): Record<string, unknown> => {
    if (value === undefined || value === null) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) return {};
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
        throw new Error('must be a JSON object');
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new NodeOperationError(this.getNode(), `${label} must be valid JSON object: ${detail}`);
      }
    }
    throw new NodeOperationError(this.getNode(), `${label} must be a JSON object`);
  };

  const extractFilterStrings = (input: unknown): string[] => {
    if (typeof input === 'string') {
      return input.trim().length > 0 ? [input] : [];
    }
    if (Array.isArray(input)) {
      const out: string[] = [];
      for (const item of input) {
        if (typeof item === 'string') {
          if (item.trim().length > 0) out.push(item);
        } else if (item !== null && typeof item === 'object') {
          const values = Object.values(item as Record<string, unknown>);
          for (const v of values) {
            if (typeof v === 'string' && v.trim().length > 0) {
              out.push(v);
              break;
            }
            if (v !== null && typeof v === 'object') {
              const nested = extractFilterStrings(v);
              if (nested.length > 0) {
                out.push(...nested);
                break;
              }
            }
          }
        }
      }
      return out;
    }
    if (input !== null && typeof input === 'object') {
      const out: string[] = [];
      for (const v of Object.values(input as Record<string, unknown>)) {
        out.push(...extractFilterStrings(v));
      }
      return out;
    }
    return [];
  };

  const readListFilters = (): string[] => {
    const combined: string[] = [];
    try {
      combined.push(...extractFilterStrings(this.getNodeParameter('filters', {})));
    } catch {
      // No filters collection present; fall through to singular fallback.
    }
    try {
      const extra = extractFilterStrings(this.getNodeParameter('filter', {}));
      if (extra.length > 0) {
        combined.push(...extra);
      }
    } catch {
      // No singular filter present; ignore.
    }
    return combined.filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
  };

  // Validate request inputs before touching headers or credentials so failures
  // leave the outgoing request untouched (no transport, no partial mutation).
  let body: Record<string, unknown> | undefined;
  let qs: IDataObject | undefined;
  let arrayFormat: IHttpRequestOptions['arrayFormat'] | undefined;

  const buildListQs = (): void => {
    // List reads only its own pagination params; it must not read templateId/notificationId.
    const nextQs: IDataObject = {};
    const page = this.getNodeParameter('page', 1);
    if (typeof page === 'number' && !Number.isNaN(page)) {
      nextQs.page = page;
    } else if (typeof page === 'string' && page.trim().length > 0) {
      nextQs.page = page;
    }
    const limit = this.getNodeParameter('limit', 10);
    if (typeof limit === 'number' && !Number.isNaN(limit)) {
      nextQs.limit = limit;
    } else if (typeof limit === 'string' && limit.trim().length > 0) {
      nextQs.limit = limit;
    }
    const sort = this.getNodeParameter('sort', '');
    if (typeof sort === 'string' && sort.trim().length > 0) {
      nextQs.sort = sort;
    }
    const filterValues = readListFilters();
    if (filterValues.length > 0) {
      nextQs.filter = filterValues;
      arrayFormat = 'repeat';
    }
    if (Object.keys(nextQs).length > 0) {
      qs = nextQs;
    }
  };

  const optionalNonBlank = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    return value.trim().length > 0 ? value : undefined;
  };

  const CHANNEL_TYPE_VALUES = ['email', 'sms', 'msgApp'] as const;
  const TRIGGER_VALUES = ['success', 'failure'] as const;
  const WEBHOOK_TYPE_VALUES = ['generic', 'teams'] as const;

  const assertHttpsUrl = (value: string, label: string): string => {
    const trimmed = value.trim();
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:' || parsed.host.length === 0) {
        throw new Error('not https');
      }
    } catch {
      throw new NodeOperationError(this.getNode(), `${label} must be an https URL`);
    }
    return trimmed;
  };

  const assertWebhookEnum = (value: string, label: string, allowed: readonly string[]): void => {
    if (!allowed.includes(value)) {
      throw new NodeOperationError(this.getNode(), `${label} must be one of ${allowed.join(', ')}`);
    }
  };

  const requireWebhookMulti = (
    input: unknown,
    label: string,
    allowed: readonly string[],
    optional: boolean,
  ): string[] | undefined => {
    const values: unknown[] =
      input === undefined || input === null
        ? []
        : Array.isArray(input)
          ? input
          : typeof input === 'string'
            ? input.trim().length > 0
              ? [input]
              : []
            : [input];
    if (values.length === 0) {
      if (optional) return undefined;
      throw new NodeOperationError(this.getNode(), `${label} must include at least one of ${allowed.join(', ')}`);
    }
    for (const entry of values) {
      if (typeof entry !== 'string' || !allowed.includes(entry)) {
        throw new NodeOperationError(this.getNode(), `${label} must be one of ${allowed.join(', ')}`);
      }
    }
    return values as string[];
  };

  if (resource === 'send' && operation === 'sendNotification') {
    body = parseJsonBody(this.getNodeParameter('payload', '{}'), 'Payload (payload)');
    // The generic endpoint takes the full request ({ email/sms/msgApp, params }).
    // A bare channel ({ recipients, ... }) belongs to the shorthand operations.
    if (
      Object.prototype.hasOwnProperty.call(body, 'recipients') &&
      !Object.prototype.hasOwnProperty.call(body, 'email') &&
      !Object.prototype.hasOwnProperty.call(body, 'sms') &&
      !Object.prototype.hasOwnProperty.call(body, 'msgApp')
    ) {
      throw new NodeOperationError(
        this.getNode(),
        'Payload (payload) must be the full request with at least one of email/sms/msgApp. ' +
          'Either wrap the channel (e.g. under "email") or use Send / Send Email / Send SMS with the bare channel.',
      );
    }
    if (
      !Object.prototype.hasOwnProperty.call(body, 'email') &&
      !Object.prototype.hasOwnProperty.call(body, 'sms') &&
      !Object.prototype.hasOwnProperty.call(body, 'msgApp')
    ) {
      throw new NodeOperationError(
        this.getNode(),
        'Payload (payload) must include at least one of email/sms/msgApp with its channel body.',
      );
    }
  } else if (resource === 'send' && operation === 'sendEmail') {
    body = parseJsonBody(this.getNodeParameter('emailPayload', '{}'), 'Email payload (emailPayload)');
    // The email shorthand takes the bare channel ({ recipients, ... }); a wrapped
    // full request ({ email: {...} }) belongs to Send / Send Notification.
    if (
      Object.prototype.hasOwnProperty.call(body, 'email') ||
      Object.prototype.hasOwnProperty.call(body, 'sms') ||
      Object.prototype.hasOwnProperty.call(body, 'msgApp')
    ) {
      throw new NodeOperationError(
        this.getNode(),
        'Email payload (emailPayload) must be the bare email channel (recipients/content/...), without an "email" wrapper. ' +
          'Either remove the wrapper or use Send / Send Notification with the full request body.',
      );
    }
    if (!Object.prototype.hasOwnProperty.call(body, 'recipients')) {
      throw new NodeOperationError(
        this.getNode(),
        'Email payload (emailPayload) must include recipients (to/cc/bcc or mergeArray).',
      );
    }
  } else if (resource === 'send' && operation === 'sendSms') {
    // NOTE: unlike the email shorthand, the SMS route takes the full request
    // ({ sms: {...}, params? }), so a wrapped body is correct here and must pass through.
    body = parseJsonBody(this.getNodeParameter('smsPayload', '{}'), 'SMS payload (smsPayload)');
    if (
      !Object.prototype.hasOwnProperty.call(body, 'sms') ||
      Object.prototype.hasOwnProperty.call(body, 'email') ||
      Object.prototype.hasOwnProperty.call(body, 'msgApp')
    ) {
      throw new NodeOperationError(
        this.getNode(),
        'SMS payload (smsPayload) must be the full SMS request with an "sms" channel, e.g. {"sms": {...}}. ' +
          'A bare channel belongs to no shorthand; an email/msgApp body belongs to the matching Send operation.',
      );
    }
  } else if (resource === 'send' && operation === 'cancelOrReschedule') {
    requireNonBlank(this.getNodeParameter('notificationId', ''), 'Notification ID (notificationId)');
    const action = this.getNodeParameter('action', 'cancel');
    if (action === 'cancel') {
      body = { action: 'cancel' };
    } else if (action === 'reschedule') {
      const scheduledTime = requireNonBlank(
        this.getNodeParameter('scheduledTime', ''),
        'Scheduled time (scheduledTime)',
      );
      const parsed = Date.parse(scheduledTime.trim());
      if (Number.isNaN(parsed)) {
        throw new NodeOperationError(
          this.getNode(),
          'Scheduled time (scheduledTime) must be a valid date-time, e.g. 2027-06-01T16:00:00Z',
        );
      }
      if (!/(?:[Zz]|[+-]\d{2}:?\d{2})\s*$/.test(scheduledTime.trim())) {
        throw new NodeOperationError(
          this.getNode(),
          'Scheduled time (scheduledTime) must include a timezone (Z suffix or numeric offset), e.g. 2027-06-01T16:00:00Z',
        );
      }
      if (parsed <= Date.now()) {
        throw new NodeOperationError(this.getNode(), 'Scheduled time (scheduledTime) must be in the future');
      }
      body = { scheduledTime };
    } else {
      throw new NodeOperationError(this.getNode(), 'Action must be one of cancel, reschedule');
    }
  } else if (resource === 'notificationStatus' && operation === 'listNotificationRequests') {
    buildListQs();
  } else if (resource === 'notificationStatus' && operation === 'getDeliveryRecords') {
    requireNonBlank(this.getNodeParameter('notificationId', ''), 'Notification ID (notificationId)');
  } else if (resource === 'templates' && operation === 'listTemplates') {
    // List never reads templateId.
    buildListQs();
  } else if (resource === 'templates' && operation === 'createTemplate') {
    // Create never reads templateId.
    const templateName = requireNonBlank(this.getNodeParameter('name', ''), 'Template name (name)');
    const channelCode = this.getNodeParameter('channelCode', '');
    if (channelCode !== 'EMAIL' && channelCode !== 'SMS') {
      throw new NodeOperationError(this.getNode(), 'Channel (channelCode) must be one of EMAIL, SMS');
    }
    const templateBody = requireNonBlank(this.getNodeParameter('body', ''), 'Body (body)');
    const nextBody: Record<string, unknown> = {
      name: templateName,
      channelCode,
      body: templateBody,
    };
    const subject = optionalNonBlank(this.getNodeParameter('subject', ''));
    if (subject !== undefined) nextBody.subject = subject;
    const engineCode = optionalNonBlank(this.getNodeParameter('engineCode', ''));
    if (engineCode !== undefined) {
      if (engineCode !== 'handlebars' && engineCode !== 'mustache') {
        throw new NodeOperationError(this.getNode(), 'Engine (engineCode) must be one of handlebars, mustache');
      }
      nextBody.engineCode = engineCode;
    }
    const bodyType = optionalNonBlank(this.getNodeParameter('bodyType', ''));
    if (bodyType !== undefined) {
      if (bodyType !== 'markdown') {
        throw new NodeOperationError(this.getNode(), 'Body type (bodyType) must be one of markdown');
      }
      nextBody.bodyType = bodyType;
    }
    const templateDescription = optionalNonBlank(this.getNodeParameter('description', ''));
    if (templateDescription !== undefined) nextBody.description = templateDescription;
    body = nextBody;
  } else if (resource === 'templates' && (operation === 'getTemplate' || operation === 'deleteTemplate')) {
    requireNonBlank(this.getNodeParameter('templateId', ''), 'Template ID (templateId)');
  } else if (resource === 'templates' && operation === 'updateTemplate') {
    requireNonBlank(this.getNodeParameter('templateId', ''), 'Template ID (templateId)');
    const nextBody: Record<string, unknown> = {};
    const templateName = optionalNonBlank(this.getNodeParameter('name', ''));
    if (templateName !== undefined) nextBody.name = templateName;
    const channelCode = optionalNonBlank(this.getNodeParameter('channelCode', ''));
    if (channelCode !== undefined) {
      if (channelCode !== 'EMAIL' && channelCode !== 'SMS') {
        throw new NodeOperationError(this.getNode(), 'Channel (channelCode) must be one of EMAIL, SMS');
      }
      nextBody.channelCode = channelCode;
    }
    const subject = optionalNonBlank(this.getNodeParameter('subject', ''));
    if (subject !== undefined) nextBody.subject = subject;
    const templateBody = optionalNonBlank(this.getNodeParameter('body', ''));
    if (templateBody !== undefined) nextBody.body = templateBody;
    const engineCode = optionalNonBlank(this.getNodeParameter('engineCode', ''));
    if (engineCode !== undefined) {
      if (engineCode !== 'handlebars' && engineCode !== 'mustache') {
        throw new NodeOperationError(this.getNode(), 'Engine (engineCode) must be one of handlebars, mustache');
      }
      nextBody.engineCode = engineCode;
    }
    const bodyType = optionalNonBlank(this.getNodeParameter('bodyType', ''));
    if (bodyType !== undefined) {
      if (bodyType !== 'markdown') {
        throw new NodeOperationError(this.getNode(), 'Body type (bodyType) must be one of markdown');
      }
      nextBody.bodyType = bodyType;
    }
    const templateDescription = optionalNonBlank(this.getNodeParameter('description', ''));
    if (templateDescription !== undefined) nextBody.description = templateDescription;
    if (Object.keys(nextBody).length === 0) {
      throw new NodeOperationError(
        this.getNode(),
        'Update must include at least one patch field (name/channelCode/subject/body/engineCode/bodyType/description)',
      );
    }
    body = nextBody;
  } else if (resource === 'templates' && operation === 'previewTemplate') {
    requireNonBlank(this.getNodeParameter('templateId', ''), 'Template ID (templateId)');
    const params = parseJsonBody(this.getNodeParameter('params', '{}'), 'Preview params (params)');
    body = { params };
  } else if (resource === 'webhooks' && operation === 'registerCallback') {
    // Register never reads callbackId.
    const rawUrl = requireNonBlank(this.getNodeParameter('url', ''), 'Callback URL (url)');
    const callbackUrl = assertHttpsUrl(rawUrl, 'Callback URL (url)');
    const channelType = requireWebhookMulti(
      this.getNodeParameter('channelType', []),
      'Channel types (channelType)',
      CHANNEL_TYPE_VALUES,
      false,
    );
    const trigger = requireWebhookMulti(
      this.getNodeParameter('trigger', []),
      'Triggers (trigger)',
      TRIGGER_VALUES,
      false,
    );
    const nextBody: Record<string, unknown> = {
      url: callbackUrl,
      channelType,
      trigger,
    };
    const secret = optionalNonBlank(this.getNodeParameter('secret', ''));
    if (secret !== undefined) nextBody.secret = secret;
    const headers = parseJsonBody(this.getNodeParameter('headers', '{}'), 'Headers (headers)');
    if (Object.keys(headers).length > 0) nextBody.headers = headers;
    const active = this.getNodeParameter('active', true);
    if (typeof active === 'boolean') nextBody.active = active;
    const webhookType = optionalNonBlank(this.getNodeParameter('webhookType', ''));
    if (webhookType !== undefined) {
      assertWebhookEnum(webhookType, 'Webhook type (webhookType)', WEBHOOK_TYPE_VALUES);
      nextBody.webhookType = webhookType;
    }
    body = nextBody;
  } else if (resource === 'webhooks' && operation === 'updateCallback') {
    requireNonBlank(this.getNodeParameter('callbackId', ''), 'Callback ID (callbackId)');
    const nextBody: Record<string, unknown> = {};
    const rawUrl = optionalNonBlank(this.getNodeParameter('url', ''));
    if (rawUrl !== undefined) {
      nextBody.url = assertHttpsUrl(rawUrl, 'Callback URL (url)');
    }
    const channelType = requireWebhookMulti(
      this.getNodeParameter('channelType', []),
      'Channel types (channelType)',
      CHANNEL_TYPE_VALUES,
      true,
    );
    if (channelType !== undefined) nextBody.channelType = channelType;
    const trigger = requireWebhookMulti(
      this.getNodeParameter('trigger', []),
      'Triggers (trigger)',
      TRIGGER_VALUES,
      true,
    );
    if (trigger !== undefined) nextBody.trigger = trigger;
    const secret = optionalNonBlank(this.getNodeParameter('secret', ''));
    if (secret !== undefined) nextBody.secret = secret;
    const headers = parseJsonBody(this.getNodeParameter('headers', '{}'), 'Headers (headers)');
    if (Object.keys(headers).length > 0) nextBody.headers = headers;
    const active = this.getNodeParameter('active', true);
    if (typeof active === 'boolean') nextBody.active = active;
    const webhookType = optionalNonBlank(this.getNodeParameter('webhookType', ''));
    if (webhookType !== undefined) {
      assertWebhookEnum(webhookType, 'Webhook type (webhookType)', WEBHOOK_TYPE_VALUES);
      nextBody.webhookType = webhookType;
    }
    body = nextBody;
  } else if (resource === 'webhooks' && operation === 'deleteCallback') {
    requireNonBlank(this.getNodeParameter('callbackId', ''), 'Callback ID (callbackId)');
    // Delete reads no other params (no stale url/secret/headers/channelType/trigger/active/webhookType reads).
  }
  // listDeliveryRecords reads no extra params (no stale notificationId/page/limit/sort/filter reads).

  const credentials = await this.getCredentials('notifyApi');
  const apiKey = credentials?.apiKey;
  if (
    typeof apiKey !== 'string' || // pragma: allowlist secret
    apiKey.trim().length === 0 // pragma: allowlist secret
  ) {
    throw new NodeOperationError(this.getNode(), 'Credential API Key must be a nonblank string');
  }
  requestOptions.baseURL = assertBaseUrl(credentials?.baseUrl);

  requestOptions.headers = requestOptions.headers ?? {};
  (requestOptions.headers as Record<string, string>)['X-API-KEY'] = apiKey;
  if (body !== undefined) {
    requestOptions.body = body;
  }
  if (qs !== undefined) {
    requestOptions.qs = { ...((requestOptions.qs as IDataObject | undefined) ?? {}), ...qs };
  }
  if (arrayFormat !== undefined) {
    requestOptions.arrayFormat = arrayFormat;
  }

  return requestOptions;
}
