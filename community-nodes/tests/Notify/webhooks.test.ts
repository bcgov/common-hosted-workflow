import { describe, expect, it } from 'vitest';
import { includeNotifyAuth } from '../../nodes/Notify/shared/requestOptions';
import { apiKey, baseUrl, createHarness, description } from './helpers';

const callbackId = 'b7f4c9e1-2a35-4d68-9f10-5c8e3a2b7d64';
const callbackUrl = 'https://example.gov.bc.ca/hooks/notify';

function webhookOperations() {
  const selector = description.properties.find(
    (property) => property.name === 'operation' && property.displayOptions?.show?.resource?.includes('webhooks'),
  );
  return selector?.options ?? [];
}

function operationDescription(value: string): string {
  const option = webhookOperations().find((entry) => entry.value === value);
  return typeof option?.description === 'string' ? option.description : '';
}

describe('Notify Webhooks operations', () => {
  it('exposes the three webhook operations with exact method and URL', () => {
    const values = webhookOperations().map((entry) => entry.value);
    expect(values).toEqual(['registerCallback', 'updateCallback', 'deleteCallback']);
    const routes = new Map(
      webhookOperations().map((entry) => [
        entry.value,
        {
          method: entry.routing?.request?.method,
          url: entry.routing?.request?.url,
        },
      ]),
    );
    expect(routes.get('registerCallback')).toEqual({
      method: 'POST',
      url: '=/api/v1/notify/registerCallback',
    });
    expect(routes.get('updateCallback')).toEqual({
      method: 'PATCH',
      url: '=/api/v1/notify/registerCallback/{{$parameter.callbackId}}',
    });
    expect(routes.get('deleteCallback')).toEqual({
      method: 'DELETE',
      url: '=/api/v1/notify/registerCallback/{{$parameter.callbackId}}',
    });
  });

  it('documents https-only URLs, retry with backoff and HMAC signature verification', () => {
    expect(operationDescription('registerCallback')).toMatch(/https-only/i);
    expect(operationDescription('registerCallback')).toMatch(/backoff/i);
    expect(operationDescription('registerCallback')).toMatch(/retry/i);
    expect(operationDescription('registerCallback')).toMatch(/HMAC/i);
    expect(operationDescription('registerCallback')).toMatch(/X-Webhook-Signature/);

    expect(operationDescription('updateCallback')).toMatch(/https-only/i);
    expect(operationDescription('updateCallback')).toMatch(/backoff/i);
    expect(operationDescription('updateCallback')).toMatch(/HMAC/i);
    expect(operationDescription('updateCallback')).toMatch(/X-Webhook-Signature/);

    const url = description.properties.find((property) => property.name === 'url');
    expect(url?.description).toMatch(/https-only/i);
    expect(url?.description).toMatch(/backoff/i);
    expect(url?.description).toMatch(/HMAC/i);

    const secret = description.properties.find((property) => property.name === 'secret');
    expect(secret?.description).toMatch(/HMAC/i);
    expect(secret?.typeOptions?.password).toBe(true);

    const channelType = description.properties.find((property) => property.name === 'channelType');
    expect(channelType?.type).toBe('multiOptions');
    expect(channelType?.options?.map((option) => option.value).sort()).toEqual(['email', 'msgApp', 'sms'].sort());

    const trigger = description.properties.find((property) => property.name === 'trigger');
    expect(trigger?.type).toBe('multiOptions');
    expect(trigger?.options?.map((option) => option.value).sort()).toEqual(['failure', 'success'].sort());

    const webhookType = description.properties.find((property) => property.name === 'webhookType');
    expect(webhookType?.type).toBe('options');
    expect(webhookType?.options?.map((option) => option.value).sort()).toEqual(['generic', 'teams'].sort());
  });
});

describe('Notify Webhooks visibility', () => {
  it('shows callbackId required only on update/delete', () => {
    const register = createHarness({ resource: 'webhooks', operation: 'registerCallback' });
    expect(register.visible('callbackId')).toHaveLength(0);

    for (const operation of ['updateCallback', 'deleteCallback']) {
      const harness = createHarness({ resource: 'webhooks', operation, callbackId });
      expect(harness.visible('callbackId')).toHaveLength(1);
      expect(harness.visible('callbackId')[0].required).toBe(true);
    }
  });

  it('shows webhook fields on register and update but not on delete', () => {
    const register = createHarness({
      resource: 'webhooks',
      operation: 'registerCallback',
      url: callbackUrl,
    });
    expect(register.visible('url')).toHaveLength(1);
    expect(register.visible('secret')).toHaveLength(1);
    expect(register.visible('headers')).toHaveLength(1);
    expect(register.visible('channelType')).toHaveLength(1);
    expect(register.visible('trigger')).toHaveLength(1);
    expect(register.visible('active')).toHaveLength(1);
    expect(register.visible('webhookType')).toHaveLength(1);
    expect(register.visible('callbackId')).toHaveLength(0);

    const update = createHarness({
      resource: 'webhooks',
      operation: 'updateCallback',
      callbackId,
      url: callbackUrl,
    });
    expect(update.visible('callbackId')).toHaveLength(1);
    expect(update.visible('url')).toHaveLength(1);
    expect(update.visible('secret')).toHaveLength(1);
    expect(update.visible('headers')).toHaveLength(1);
    expect(update.visible('channelType')).toHaveLength(1);
    expect(update.visible('trigger')).toHaveLength(1);
    expect(update.visible('active')).toHaveLength(1);
    expect(update.visible('webhookType')).toHaveLength(1);

    const del = createHarness({
      resource: 'webhooks',
      operation: 'deleteCallback',
      callbackId,
    });
    expect(del.visible('callbackId')).toHaveLength(1);
    expect(del.visible('url')).toHaveLength(0);
    expect(del.visible('secret')).toHaveLength(0);
    expect(del.visible('headers')).toHaveLength(0);
    expect(del.visible('channelType')).toHaveLength(0);
    expect(del.visible('trigger')).toHaveLength(0);
    expect(del.visible('active')).toHaveLength(0);
    expect(del.visible('webhookType')).toHaveLength(0);
  });

  it('hides webhook params on other resources', () => {
    const send = createHarness({ resource: 'send', operation: 'sendNotification' });
    expect(send.visible('callbackId')).toHaveLength(0);
    expect(send.visible('url')).toHaveLength(0);
    expect(send.visible('secret')).toHaveLength(0);
    expect(send.visible('channelType')).toHaveLength(0);

    const list = createHarness({ resource: 'templates', operation: 'listTemplates' });
    expect(list.visible('callbackId')).toHaveLength(0);
    expect(list.visible('url')).toHaveLength(0);
  });
});

describe('Notify Webhooks / Register', () => {
  it('resolves POST with full body preserved and auth', async () => {
    const headers = { 'X-Environment': 'production' };
    const { send, httpRequest } = createHarness({
      resource: 'webhooks',
      operation: 'registerCallback',
      url: callbackUrl,
      secret: 'your-test-secret-value', // pragma: allowlist secret
      headers,
      channelType: ['email', 'sms'],
      trigger: ['success', 'failure'],
      active: true,
      webhookType: 'generic',
    });
    const request = await send();
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/api/v1/notify/registerCallback');
    expect(request.baseURL).toBe(baseUrl);
    expect(request.body).toEqual({
      url: callbackUrl,
      secret: 'your-test-secret-value', // pragma: allowlist secret
      headers,
      channelType: ['email', 'sms'],
      trigger: ['success', 'failure'],
      active: true,
      webhookType: 'generic',
    });
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
  });

  it('omits empty optional secret/headers/webhookType while keeping required fields', async () => {
    const { send } = createHarness({
      resource: 'webhooks',
      operation: 'registerCallback',
      url: callbackUrl,
      secret: '',
      headers: '{}',
      channelType: ['email'],
      trigger: ['success'],
      active: true,
      webhookType: '',
    });
    const request = await send();
    expect(request.body).toEqual({
      url: callbackUrl,
      channelType: ['email'],
      trigger: ['success'],
      active: true,
    });
  });

  it('parses string JSON headers', async () => {
    const headers = { 'X-Environment': 'production' };
    const { send } = createHarness({
      resource: 'webhooks',
      operation: 'registerCallback',
      url: callbackUrl,
      secret: '',
      headers: JSON.stringify(headers),
      channelType: ['sms'],
      trigger: ['failure'],
      active: false,
      webhookType: 'teams',
    });
    const request = await send();
    expect(request.body).toMatchObject({ headers, active: false, webhookType: 'teams' });
  });

  it.each(['', '   '])('rejects blank url (%j) without transport', async (value) => {
    const { send, httpRequest } = createHarness({
      resource: 'webhooks',
      operation: 'registerCallback',
      url: value,
      channelType: ['email'],
      trigger: ['success'],
    });
    await expect(send()).rejects.toThrow('Callback URL (url)');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it.each(['http://example.gov.bc.ca/hooks/notify', 'example.gov.bc.ca/hooks', 'ftp://example.ca/x'])(
    'rejects non-https url (%j) without transport',
    async (value) => {
      const { send, httpRequest } = createHarness({
        resource: 'webhooks',
        operation: 'registerCallback',
        url: value,
        channelType: ['email'],
        trigger: ['success'],
      });
      await expect(send()).rejects.toThrow('Callback URL (url) must be an https URL');
      expect(httpRequest).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ channelType: [], trigger: ['success'] }, 'Channel types (channelType) must include at least one'],
    [{ channelType: ['email'], trigger: [] }, 'Triggers (trigger) must include at least one'],
    [{ channelType: ['push'], trigger: ['success'] }, 'Channel types (channelType) must be one of'],
    [{ channelType: ['email'], trigger: ['delivered'] }, 'Triggers (trigger) must be one of'],
    [{ channelType: ['email'], trigger: ['success'], webhookType: 'slack' }, 'Webhook type (webhookType)'],
    [{ channelType: ['email'], trigger: ['success'], headers: '{not-json' }, 'Headers (headers) must be valid JSON'],
  ])('rejects invalid register (%j) without transport', async (overrides, message) => {
    const { send, httpRequest } = createHarness({
      resource: 'webhooks',
      operation: 'registerCallback',
      url: callbackUrl,
      secret: '',
      headers: '{}',
      channelType: ['email'],
      trigger: ['success'],
      active: true,
      webhookType: '',
      ...overrides,
    });
    await expect(send()).rejects.toThrow(message);
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it('never includes secret values in errors', async () => {
    const secret = 'your-super-secret-never-log-123'; // pragma: allowlist secret
    const { send, httpRequest } = createHarness({
      resource: 'webhooks',
      operation: 'registerCallback',
      url: callbackUrl,
      secret,
      headers: '{}',
      channelType: ['carrier-pigeon'],
      trigger: ['success'],
      active: true,
      webhookType: '',
    });
    const error = await send().catch((err: Error) => err);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).not.toContain(secret);
    expect(httpRequest).not.toHaveBeenCalled();

    const blankUrl = createHarness({
      resource: 'webhooks',
      operation: 'registerCallback',
      url: '',
      secret,
      channelType: ['email'],
      trigger: ['success'],
    });
    const blankError = await blankUrl.send().catch((err: Error) => err);
    expect(String((blankError as Error).message)).not.toContain(secret);
    expect(blankUrl.httpRequest).not.toHaveBeenCalled();
  });

  it('register never reads callbackId', async () => {
    const { send, getNodeParameter } = createHarness({
      resource: 'webhooks',
      operation: 'registerCallback',
      url: callbackUrl,
      channelType: ['email'],
      trigger: ['success'],
      callbackId: 'should-be-ignored',
    });
    const request = await send();
    expect(request.url).toBe('/api/v1/notify/registerCallback');
    expect(getNodeParameter.mock.calls.some(([name]) => name === 'callbackId')).toBe(false);
  });
});

describe('Notify Webhooks / Update', () => {
  it('resolves PATCH with callbackId interpolation and partial body preserved', async () => {
    const headers = { 'X-Environment': 'staging' };
    const { send, httpRequest } = createHarness({
      resource: 'webhooks',
      operation: 'updateCallback',
      callbackId,
      url: callbackUrl,
      secret: 'rotated-secret', // pragma: allowlist secret
      headers,
      channelType: ['msgApp'],
      trigger: ['failure'],
      active: false,
      webhookType: 'teams',
    });
    const request = await send();
    expect(request.method).toBe('PATCH');
    expect(request.url).toBe(`/api/v1/notify/registerCallback/${callbackId}`);
    expect(request.baseURL).toBe(baseUrl);
    expect(request.body).toEqual({
      url: callbackUrl,
      secret: 'rotated-secret', // // pragma: allowlist secret
      headers,
      channelType: ['msgApp'],
      trigger: ['failure'],
      active: false,
      webhookType: 'teams',
    });
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
  });

  it('omits empty optional fields on update', async () => {
    const { send } = createHarness({
      resource: 'webhooks',
      operation: 'updateCallback',
      callbackId,
      url: '',
      secret: '',
      headers: '{}',
      channelType: [],
      trigger: [],
      active: true,
      webhookType: '',
    });
    const request = await send();
    expect(request.body).toEqual({ active: true });
  });

  it.each(['', '   '])('rejects blank callbackId (%j) without transport', async (value) => {
    const { send, httpRequest } = createHarness({
      resource: 'webhooks',
      operation: 'updateCallback',
      callbackId: value,
      url: callbackUrl,
    });
    await expect(send()).rejects.toThrow('Callback ID (callbackId) must be a nonblank string');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 123, false, {}, []])(
    'rejects invalid callbackId (%j) in pre-send without mutating the request',
    async (value) => {
      const { context } = createHarness({
        resource: 'webhooks',
        operation: 'updateCallback',
        callbackId: value,
      });
      const headers = Object.freeze({ Accept: 'application/json' });
      const request = { url: '/api/v1/notify/registerCallback/x', headers };
      await expect(includeNotifyAuth.call(context, request)).rejects.toThrow(
        'Callback ID (callbackId) must be a nonblank string',
      );
      expect(request).toEqual({ url: '/api/v1/notify/registerCallback/x', headers });
    },
  );

  it('rejects invalid enums and non-https url on update without transport', async () => {
    const badChannel = createHarness({
      resource: 'webhooks',
      operation: 'updateCallback',
      callbackId,
      channelType: ['push'],
    });
    await expect(badChannel.send()).rejects.toThrow('Channel types (channelType)');
    expect(badChannel.httpRequest).not.toHaveBeenCalled();

    const badTrigger = createHarness({
      resource: 'webhooks',
      operation: 'updateCallback',
      callbackId,
      trigger: ['delivered'],
    });
    await expect(badTrigger.send()).rejects.toThrow('Triggers (trigger)');
    expect(badTrigger.httpRequest).not.toHaveBeenCalled();

    const badType = createHarness({
      resource: 'webhooks',
      operation: 'updateCallback',
      callbackId,
      webhookType: 'slack',
    });
    await expect(badType.send()).rejects.toThrow('Webhook type (webhookType)');
    expect(badType.httpRequest).not.toHaveBeenCalled();

    const badUrl = createHarness({
      resource: 'webhooks',
      operation: 'updateCallback',
      callbackId,
      url: 'http://example.gov.bc.ca/hooks',
    });
    await expect(badUrl.send()).rejects.toThrow('Callback URL (url) must be an https URL');
    expect(badUrl.httpRequest).not.toHaveBeenCalled();
  });

  it('never includes secret values in update errors', async () => {
    const secret = 'your-updated-secret-never-log-456'; // pragma: allowlist secret
    const { send, httpRequest } = createHarness({
      resource: 'webhooks',
      operation: 'updateCallback',
      callbackId,
      url: 'http://insecure.example/hooks',
      secret,
    });
    const error = await send().catch((err: Error) => err);
    expect(String((error as Error).message)).not.toContain(secret);
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it('uses current-item expressions for callbackId interpolation', async () => {
    const { send } = createHarness(
      {
        resource: 'webhooks',
        operation: 'updateCallback',
        callbackId: '={{ $json.callbackId }}',
        url: callbackUrl,
        channelType: [],
        trigger: [],
        headers: '{}',
        secret: '',
        webhookType: '',
        active: true,
      },
      {},
      { callbackId },
    );
    const request = await send();
    expect(request.url).toBe(`/api/v1/notify/registerCallback/${callbackId}`);
  });
});

describe('Notify Webhooks / Delete', () => {
  it('resolves DELETE with callbackId and auth and no body', async () => {
    const { send, httpRequest, getNodeParameter } = createHarness({
      resource: 'webhooks',
      operation: 'deleteCallback',
      callbackId,
    });
    const request = await send();
    expect(request.method).toBe('DELETE');
    expect(request.url).toBe(`/api/v1/notify/registerCallback/${callbackId}`);
    expect(request.baseURL).toBe(baseUrl);
    expect(request.body).toBeUndefined();
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
    expect(getNodeParameter.mock.calls.some(([name]) => name === 'url')).toBe(false);
    expect(getNodeParameter.mock.calls.some(([name]) => name === 'secret')).toBe(false);
    expect(getNodeParameter.mock.calls.some(([name]) => name === 'channelType')).toBe(false);
  });

  it.each(['', '   '])('rejects blank callbackId (%j) without transport', async (value) => {
    const { send, httpRequest } = createHarness({
      resource: 'webhooks',
      operation: 'deleteCallback',
      callbackId: value,
    });
    await expect(send()).rejects.toThrow('Callback ID (callbackId) must be a nonblank string');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 123, false, {}, []])(
    'rejects invalid callbackId (%j) in pre-send without mutating the request',
    async (value) => {
      const { context } = createHarness({
        resource: 'webhooks',
        operation: 'deleteCallback',
        callbackId: value,
      });
      const headers = Object.freeze({ Accept: 'application/json' });
      const request = { url: '/api/v1/notify/registerCallback/x', headers };
      await expect(includeNotifyAuth.call(context, request)).rejects.toThrow(
        'Callback ID (callbackId) must be a nonblank string',
      );
      expect(request).toEqual({ url: '/api/v1/notify/registerCallback/x', headers });
    },
  );

  it('uses current-item expressions for callbackId interpolation', async () => {
    const { send } = createHarness(
      {
        resource: 'webhooks',
        operation: 'deleteCallback',
        callbackId: '={{ $json.callbackId }}',
      },
      {},
      { callbackId },
    );
    const request = await send();
    expect(request.url).toBe(`/api/v1/notify/registerCallback/${callbackId}`);
  });
});
