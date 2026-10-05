import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NotifyApi } from '../../credentials/NotifyApi.credentials';
import { includeNotifyAuth } from '../../nodes/Notify/shared/requestOptions';
import { apiKey, baseUrl, createHarness, description } from './helpers';

const operations = [
  {
    resource: 'send',
    operation: 'sendNotification',
    method: 'POST',
    path: '/api/v1/notifysimple',
    needsAuth: true,
  },
  {
    resource: 'notificationStatus',
    operation: 'listNotificationRequests',
    method: 'GET',
    path: '/api/v1/notification_request',
    needsAuth: true,
  },
  {
    resource: 'templates',
    operation: 'listTemplates',
    method: 'GET',
    path: '/api/v1/templates',
    needsAuth: true,
  },
  {
    resource: 'webhooks',
    operation: 'registerCallback',
    method: 'POST',
    path: '/api/v1/notify/registerCallback',
    needsAuth: true,
  },
  {
    resource: 'service',
    operation: 'checkHealth',
    method: 'GET',
    path: '/api/health',
    needsAuth: false,
  },
];

describe.each(operations)('Notify $resource / $operation', ({ resource, operation, method, path, needsAuth }) => {
  it('shows a single visible operation selector', () => {
    const { visible } = createHarness({ resource, operation });
    expect(visible('operation')).toHaveLength(1);
    expect(visible('operation')[0].noDataExpression).toBe(true);
  });

  it('resolves the declared method/path with credential baseURL', async () => {
    const { send, httpRequest } = createHarness({ resource, operation });
    const request = await send();
    expect(request.method).toBe(method);
    expect(request.url).toBe(path);
    expect(request.baseURL).toBe(baseUrl);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
  });

  it(needsAuth ? 'sends the configured X-API-KEY header' : 'sends no X-API-KEY header', async () => {
    const { send, getCredentials, httpRequest } = createHarness({ resource, operation });
    const request = await send();
    expect(request.headers?.Accept).toBe('application/json');
    if (needsAuth) {
      expect(request.headers?.['X-API-KEY']).toBe(apiKey);
      expect(getCredentials).toHaveBeenCalledExactlyOnceWith('notifyApi');
    } else {
      // Health sends no key but still reads the credential's Base URL to build the request URL.
      expect(request.headers?.['X-API-KEY']).toBeUndefined();
      expect(JSON.stringify(request)).not.toContain(apiKey);
      expect(getCredentials).toHaveBeenCalledExactlyOnceWith('notifyApi');
    }
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
  });
});

describe('Notify health and versioned auth probe', () => {
  it('health hits GET /api/health with baseUrl but no key header', async () => {
    const { send, getCredentials } = createHarness({ resource: 'service', operation: 'checkHealth' });
    const request = await send();
    expect(request).toEqual({
      baseURL: baseUrl,
      method: 'GET',
      url: '/api/health',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    expect(getCredentials).toHaveBeenCalledExactlyOnceWith('notifyApi');
  });

  it.each([
    { baseUrl: '' },
    { baseUrl: '   ' },
    { baseUrl: 'notify-test.example.ca' },
    { baseUrl: 'ftp://notify-test.example.ca' },
  ])('health rejects an unusable Base URL without transport (%j)', async (overrides) => {
    const { send, httpRequest } = createHarness({ resource: 'service', operation: 'checkHealth' }, overrides);
    await expect(send()).rejects.toThrow('Base URL (baseUrl)');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it('normalizes a trailing-slash Base URL for versioned and health calls', async () => {
    for (const selection of [
      { resource: 'service', operation: 'checkHealth' },
      { resource: 'templates', operation: 'listTemplates' },
    ]) {
      const { send, httpRequest } = createHarness(selection, {
        baseUrl: 'https://notify-test.example.ca/',
      });
      const request = await send();
      expect(request.baseURL).toBe('https://notify-test.example.ca');
      expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
    }
  });

  it('rejects a blank Base URL on versioned calls without transport', async () => {
    const { send, httpRequest } = createHarness({ resource: 'templates', operation: 'listTemplates' }, { baseUrl: '' });
    await expect(send()).rejects.toThrow('Base URL (baseUrl)');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it('template list carries the configured key header', async () => {
    const { send, getCredentials } = createHarness({
      resource: 'templates',
      operation: 'listTemplates',
    });
    const request = await send();
    expect(request.method).toBe('GET');
    expect(request.url).toBe('/api/v1/templates');
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(getCredentials).toHaveBeenCalledExactlyOnceWith('notifyApi');
    expect(JSON.stringify(request)).not.toContain('password');
  });

  it('rejects missing API keys before transport', async () => {
    const { send, httpRequest } = createHarness(
      { resource: 'templates', operation: 'listTemplates' },
      { apiKey: undefined },
    );
    await expect(send()).rejects.toThrow('Credential API Key must be a nonblank string');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it.each([
    { resource: 'send', operation: 'checkHealth' },
    { resource: 'service', operation: 'listTemplates' },
    { resource: 'unknown', operation: 'checkHealth' },
    { resource: undefined, operation: undefined },
  ])('rejects unsupported selections without adding headers (%j)', async (selection) => {
    const { context } = createHarness(selection);
    const request = { url: '/test' };
    await expect(includeNotifyAuth.call(context, request)).rejects.toThrow(
      'Unsupported Notify resource/operation selection',
    );
    expect(request).toEqual({ url: '/test' });
  });
});

describe('Notify identifiers, metadata and manifest', () => {
  it('retains serialized node, operation, property and credential identifiers', () => {
    expect(description.name).toBe('notify');
    expect(description.version).toBe(1);
    expect(description.credentials).toEqual([{ name: 'notifyApi', required: true }]);
    expect(description.requestDefaults?.baseURL).toBe('={{$credentials.notifyApi.baseUrl}}');
    const resourceProperty = description.properties.find(({ name }) => name === 'resource');
    expect(resourceProperty?.options?.map((option) => option.value)).toEqual([
      'send',
      'notificationStatus',
      'templates',
      'webhooks',
      'service',
    ]);
    const credential = new NotifyApi();
    expect(credential.name).toBe('notifyApi');
    expect(credential.properties.map(({ name }) => name)).toEqual(['baseUrl', 'apiKey']);
    const apiKeyProperty = credential.properties.find(({ name }) => name === 'apiKey');
    expect(apiKeyProperty?.typeOptions?.password).toBe(true);
  });

  it('links metadata and credentials to the notify docs', () => {
    const metadata = JSON.parse(readFileSync(new URL('../../nodes/Notify/Notify.node.json', import.meta.url), 'utf8'));
    const base = 'https://bcgov.github.io/common-hosted-workflow/community-nodes/notify';
    expect(metadata.node).toBe('n8n-nodes-notify');
    expect(metadata.resources.primaryDocumentation).toEqual([{ url: base }]);
    expect(metadata.resources.credentialDocumentation).toEqual([{ url: `${base}/credentials` }]);
    expect(new NotifyApi().documentationUrl).toBe(`${base}/credentials`);
  });

  it('registers compiled outputs in the package manifest', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      n8n: { nodes: string[]; credentials: string[] };
    };
    expect(manifest.n8n.nodes).toContain('dist/nodes/Notify/Notify.node.js');
    expect(manifest.n8n.credentials).toContain('dist/credentials/NotifyApi.credentials.js');
  });
});
