import { describe, expect, it } from 'vitest';
import { includeNotifyAuth } from '../../nodes/Notify/shared/requestOptions';
import { apiKey, baseUrl, createHarness, description } from './helpers';

const templateId = '3f1a7c2e-9b45-4d10-8e21-6c0f5a9b7d33';

function templateOperations() {
  const selector = description.properties.find(
    (property) => property.name === 'operation' && property.displayOptions?.show?.resource?.includes('templates'),
  );
  return selector?.options ?? [];
}

function operationDescription(value: string): string {
  const option = templateOperations().find((entry) => entry.value === value);
  return typeof option?.description === 'string' ? option.description : '';
}

describe('Notify Templates operations', () => {
  it('exposes the six template operations with exact method and URL', () => {
    const values = templateOperations().map((entry) => entry.value);
    expect(values).toEqual([
      'listTemplates',
      'createTemplate',
      'getTemplate',
      'updateTemplate',
      'deleteTemplate',
      'previewTemplate',
    ]);
    const routes = new Map(
      templateOperations().map((entry) => [
        entry.value,
        {
          method: entry.routing?.request?.method,
          url: entry.routing?.request?.url,
        },
      ]),
    );
    expect(routes.get('listTemplates')).toEqual({
      method: 'GET',
      url: '=/api/v1/templates',
    });
    expect(routes.get('createTemplate')).toEqual({
      method: 'POST',
      url: '=/api/v1/templates',
    });
    expect(routes.get('getTemplate')).toEqual({
      method: 'GET',
      url: '=/api/v1/templates/{{$parameter.templateId}}',
    });
    expect(routes.get('updateTemplate')).toEqual({
      method: 'PATCH',
      url: '=/api/v1/templates/{{$parameter.templateId}}',
    });
    expect(routes.get('deleteTemplate')).toEqual({
      method: 'DELETE',
      url: '=/api/v1/templates/{{$parameter.templateId}}',
    });
    expect(routes.get('previewTemplate')).toEqual({
      method: 'POST',
      url: '=/api/v1/templates/{{$parameter.templateId}}/preview',
    });
  });

  it('documents editor role, placeholder filling and email subject guidance', () => {
    expect(operationDescription('createTemplate')).toMatch(/NOTIFY_TEMPLATE_EDITOR/);
    expect(operationDescription('updateTemplate')).toMatch(/NOTIFY_TEMPLATE_EDITOR/);
    expect(operationDescription('deleteTemplate')).toMatch(/NOTIFY_TEMPLATE_EDITOR/);
    expect(operationDescription('createTemplate')).toMatch(/\{\{firstName\}\}/);
    expect(operationDescription('previewTemplate')).toMatch(/\{\{/);

    const subject = description.properties.find((property) => property.name === 'subject');
    expect(subject?.description).toMatch(/required for EMAIL/i);
    expect(subject?.description).toMatch(/server validates/i);
    expect(subject?.required).not.toBe(true);

    const channel = description.properties.find((property) => property.name === 'channelCode');
    expect(channel?.type).toBe('options');
    expect(channel?.options?.map((option) => option.value)).toEqual(['EMAIL', 'SMS']);

    const engine = description.properties.find((property) => property.name === 'engineCode');
    expect(engine?.type).toBe('options');
    expect(engine?.options?.map((option) => option.value)).toEqual(['handlebars', 'mustache']);

    const bodyType = description.properties.find((property) => property.name === 'bodyType');
    expect(bodyType?.type).toBe('options');
    expect(bodyType?.options?.map((option) => option.value)).toEqual(['markdown']);
  });
});

describe('Notify Templates visibility', () => {
  it('shows pagination only for list and hides templateId and template fields', () => {
    const { visible, getNodeParameter } = createHarness({
      resource: 'templates',
      operation: 'listTemplates',
      page: 2,
      limit: 25,
      sort: '-updatedAt,name',
      filters: { filter: [{ filter: 'channelCode:eq:EMAIL' }] },
    });
    expect(visible('operation')).toHaveLength(1);
    expect(visible('page')).toHaveLength(1);
    expect(visible('limit')).toHaveLength(1);
    expect(visible('sort')).toHaveLength(1);
    expect(visible('filters')).toHaveLength(1);
    expect(visible('templateId')).toHaveLength(0);
    expect(visible('name')).toHaveLength(0);
    expect(visible('channelCode')).toHaveLength(0);
    expect(visible('subject')).toHaveLength(0);
    expect(visible('body')).toHaveLength(0);
    expect(visible('engineCode')).toHaveLength(0);
    expect(visible('bodyType')).toHaveLength(0);
    expect(visible('description')).toHaveLength(0);
    expect(visible('params')).toHaveLength(0);
    expect(getNodeParameter).not.toHaveBeenCalledWith('templateId', expect.anything());
  });

  it('shows create fields without templateId or pagination', () => {
    const { visible } = createHarness({
      resource: 'templates',
      operation: 'createTemplate',
      name: 'Permit approved',
      channelCode: 'EMAIL',
    });
    expect(visible('templateId')).toHaveLength(0);
    expect(visible('page')).toHaveLength(0);
    expect(visible('limit')).toHaveLength(0);
    expect(visible('sort')).toHaveLength(0);
    expect(visible('filters')).toHaveLength(0);
    expect(visible('params')).toHaveLength(0);
    expect(visible('name')).toHaveLength(1);
    expect(visible('channelCode')).toHaveLength(1);
    expect(visible('subject')).toHaveLength(1);
    expect(visible('body')).toHaveLength(1);
    expect(visible('engineCode')).toHaveLength(1);
    expect(visible('bodyType')).toHaveLength(1);
    expect(visible('description')).toHaveLength(1);
  });

  it('shows required templateId only on get/update/delete/preview', () => {
    const list = createHarness({ resource: 'templates', operation: 'listTemplates' });
    expect(list.visible('templateId')).toHaveLength(0);

    const create = createHarness({ resource: 'templates', operation: 'createTemplate' });
    expect(create.visible('templateId')).toHaveLength(0);

    for (const operation of ['getTemplate', 'updateTemplate', 'deleteTemplate', 'previewTemplate']) {
      const harness = createHarness({ resource: 'templates', operation, templateId });
      expect(harness.visible('templateId')).toHaveLength(1);
      expect(harness.visible('templateId')[0].required).toBe(true);
    }

    const get = createHarness({ resource: 'templates', operation: 'getTemplate', templateId });
    expect(get.visible('params')).toHaveLength(0);
    expect(get.visible('name')).toHaveLength(0);

    const update = createHarness({ resource: 'templates', operation: 'updateTemplate', templateId });
    expect(update.visible('name')).toHaveLength(1);
    expect(update.visible('params')).toHaveLength(0);
    expect(update.visible('page')).toHaveLength(0);

    const del = createHarness({ resource: 'templates', operation: 'deleteTemplate', templateId });
    expect(del.visible('name')).toHaveLength(0);
    expect(del.visible('params')).toHaveLength(0);

    const preview = createHarness({ resource: 'templates', operation: 'previewTemplate', templateId });
    expect(preview.visible('params')).toHaveLength(1);
    expect(preview.visible('name')).toHaveLength(0);
    expect(preview.visible('page')).toHaveLength(0);
  });
});

describe('Notify Templates / List', () => {
  it('resolves GET with page/limit/sort/repeated-filter qs and auth', async () => {
    const { send, httpRequest, getNodeParameter } = createHarness({
      resource: 'templates',
      operation: 'listTemplates',
      page: 2,
      limit: 25,
      sort: '-updatedAt,name',
      filters: {
        filter: [{ filter: 'channelCode:eq:EMAIL' }, { filter: 'name:like:welcome' }],
      },
    });
    const request = await send();
    expect(request.method).toBe('GET');
    expect(request.url).toBe('/api/v1/templates');
    expect(request.baseURL).toBe(baseUrl);
    expect(request.qs).toEqual({
      page: 2,
      limit: 25,
      sort: '-updatedAt,name',
      filter: ['channelCode:eq:EMAIL', 'name:like:welcome'],
    });
    expect(request.arrayFormat).toBe('repeat');
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
    expect(getNodeParameter.mock.calls.some(([name]) => name === 'templateId')).toBe(false);
  });

  it('omits empty sort and filter while keeping page/limit', async () => {
    const { send } = createHarness({
      resource: 'templates',
      operation: 'listTemplates',
      page: 1,
      limit: 10,
      sort: '',
      filters: {},
    });
    const request = await send();
    expect(request.method).toBe('GET');
    expect(request.url).toBe('/api/v1/templates');
    expect(request.qs).toEqual({ page: 1, limit: 10 });
    expect(request.arrayFormat).toBeUndefined();
  });
});

describe('Notify Templates / Create', () => {
  const fullCreate = {
    name: 'Permit approved',
    channelCode: 'EMAIL',
    subject: 'Permit {{permitNumber}} approved',
    body: 'Hello {{firstName}},\n\nPermit {{permitNumber}} has been approved.',
    engineCode: 'handlebars',
    bodyType: 'markdown',
    description: 'Sent when a permit application is approved',
  };

  it('resolves POST with full body preserved and auth', async () => {
    const { send, httpRequest, getNodeParameter } = createHarness({
      resource: 'templates',
      operation: 'createTemplate',
      ...fullCreate,
    });
    const request = await send();
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/api/v1/templates');
    expect(request.baseURL).toBe(baseUrl);
    expect(request.body).toEqual(fullCreate);
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
    expect(getNodeParameter.mock.calls.some(([name]) => name === 'templateId')).toBe(false);
  });

  it('omits empty optional fields for SMS create', async () => {
    const { send } = createHarness({
      resource: 'templates',
      operation: 'createTemplate',
      name: 'Appointment reminder',
      channelCode: 'SMS',
      subject: '',
      body: 'Reminder: your appointment is at {{appointmentTime}} tomorrow.',
      engineCode: '',
      bodyType: '',
      description: '',
    });
    const request = await send();
    expect(request.body).toEqual({
      name: 'Appointment reminder',
      channelCode: 'SMS',
      body: 'Reminder: your appointment is at {{appointmentTime}} tomorrow.',
    });
  });

  it.each([
    [{ name: '', channelCode: 'EMAIL', body: 'Hello' }, 'Template name (name) must be a nonblank string'],
    [{ name: 'Test', channelCode: '', body: 'Hello' }, 'Channel (channelCode) must be one of EMAIL, SMS'],
    [{ name: 'Test', channelCode: 'PUSH', body: 'Hello' }, 'Channel (channelCode) must be one of EMAIL, SMS'],
    [{ name: 'Test', channelCode: 'EMAIL', body: '' }, 'Body (body) must be a nonblank string'],
    [
      { name: 'Test', channelCode: 'EMAIL', body: 'Hi', engineCode: 'mjml' },
      'Engine (engineCode) must be one of handlebars, mustache',
    ],
    [
      { name: 'Test', channelCode: 'EMAIL', body: 'Hi', bodyType: 'html' },
      'Body type (bodyType) must be one of markdown',
    ],
  ])('rejects invalid create (%j) without transport', async (overrides, message) => {
    const { send, httpRequest } = createHarness({
      resource: 'templates',
      operation: 'createTemplate',
      name: 'Test',
      channelCode: 'EMAIL',
      body: 'Hi',
      subject: '',
      engineCode: '',
      bodyType: '',
      description: '',
      ...overrides,
    });
    await expect(send()).rejects.toThrow(message);
    expect(httpRequest).not.toHaveBeenCalled();
  });
});

describe('Notify Templates / Get', () => {
  it('resolves GET with templateId interpolation and auth', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'templates',
      operation: 'getTemplate',
      templateId,
    });
    const request = await send();
    expect(request.method).toBe('GET');
    expect(request.url).toBe(`/api/v1/templates/${templateId}`);
    expect(request.baseURL).toBe(baseUrl);
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
  });

  it.each(['', '   '])('rejects blank templateId (%j) without transport', async (value) => {
    const { send, httpRequest } = createHarness({
      resource: 'templates',
      operation: 'getTemplate',
      templateId: value,
    });
    await expect(send()).rejects.toThrow('Template ID (templateId) must be a nonblank string');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 123, false, {}, []])(
    'rejects invalid templateId (%j) in pre-send without mutating the request',
    async (value) => {
      const { context } = createHarness({
        resource: 'templates',
        operation: 'getTemplate',
        templateId: value,
      });
      const headers = Object.freeze({ Accept: 'application/json' });
      const request = { url: '/api/v1/templates/x', headers };
      await expect(includeNotifyAuth.call(context, request)).rejects.toThrow(
        'Template ID (templateId) must be a nonblank string',
      );
      expect(request).toEqual({ url: '/api/v1/templates/x', headers });
    },
  );

  it('uses current-item expressions for templateId interpolation', async () => {
    const { send } = createHarness(
      {
        resource: 'templates',
        operation: 'getTemplate',
        templateId: '={{ $json.templateId }}',
      },
      {},
      { templateId },
    );
    const request = await send();
    expect(request.url).toBe(`/api/v1/templates/${templateId}`);
  });
});

describe('Notify Templates / Update', () => {
  it('resolves PATCH with templateId and partial body preserved', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'templates',
      operation: 'updateTemplate',
      templateId,
      name: '',
      channelCode: '',
      subject: 'Permit {{permitNumber}} is ready for collection',
      body: '',
      engineCode: '',
      bodyType: '',
      description: '',
    });
    const request = await send();
    expect(request.method).toBe('PATCH');
    expect(request.url).toBe(`/api/v1/templates/${templateId}`);
    expect(request.body).toEqual({ subject: 'Permit {{permitNumber}} is ready for collection' });
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
  });

  it('sends full patch body when all fields provided', async () => {
    const patch = {
      name: 'Renamed',
      channelCode: 'SMS',
      subject: 'Hi {{name}}',
      body: 'Hello {{name}}',
      engineCode: 'mustache',
      bodyType: 'markdown',
      description: 'Updated',
    };
    const { send } = createHarness({
      resource: 'templates',
      operation: 'updateTemplate',
      templateId,
      ...patch,
    });
    const request = await send();
    expect(request.body).toEqual(patch);
  });

  it.each(['', '   '])('rejects blank templateId (%j) without transport', async (value) => {
    const { send, httpRequest } = createHarness({
      resource: 'templates',
      operation: 'updateTemplate',
      templateId: value,
      subject: 'New subject',
    });
    await expect(send()).rejects.toThrow('Template ID (templateId) must be a nonblank string');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid channelCode on update without transport', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'templates',
      operation: 'updateTemplate',
      templateId,
      channelCode: 'PUSH',
    });
    await expect(send()).rejects.toThrow('Channel (channelCode) must be one of EMAIL, SMS');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it('rejects an empty patch without transport', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'templates',
      operation: 'updateTemplate',
      templateId,
      name: '',
      channelCode: '',
      subject: '',
      body: '',
      engineCode: '',
      bodyType: '',
      description: '',
    });
    await expect(send()).rejects.toThrow('at least one patch field');
    expect(httpRequest).not.toHaveBeenCalled();
  });
});

describe('Notify Templates / Delete', () => {
  it('resolves DELETE with templateId and auth and no body', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'templates',
      operation: 'deleteTemplate',
      templateId,
    });
    const request = await send();
    expect(request.method).toBe('DELETE');
    expect(request.url).toBe(`/api/v1/templates/${templateId}`);
    expect(request.baseURL).toBe(baseUrl);
    expect(request.body).toBeUndefined();
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
  });

  it.each(['', '   '])('rejects blank templateId (%j) without transport', async (value) => {
    const { send, httpRequest } = createHarness({
      resource: 'templates',
      operation: 'deleteTemplate',
      templateId: value,
    });
    await expect(send()).rejects.toThrow('Template ID (templateId) must be a nonblank string');
    expect(httpRequest).not.toHaveBeenCalled();
  });
});

describe('Notify Templates / Preview', () => {
  const params = { firstName: 'Alice', permitNumber: 'BC-2026-00417' };

  it('resolves POST preview suffix with { params } body and auth', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'templates',
      operation: 'previewTemplate',
      templateId,
      params,
    });
    const request = await send();
    expect(request.method).toBe('POST');
    expect(request.url).toBe(`/api/v1/templates/${templateId}/preview`);
    expect(request.baseURL).toBe(baseUrl);
    expect(request.body).toEqual({ params });
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
  });

  it('parses string JSON params', async () => {
    const { send } = createHarness({
      resource: 'templates',
      operation: 'previewTemplate',
      templateId,
      params: JSON.stringify(params),
    });
    expect((await send()).body).toEqual({ params });
  });

  it('rejects invalid JSON params without transport', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'templates',
      operation: 'previewTemplate',
      templateId,
      params: '{not-json',
    });
    await expect(send()).rejects.toThrow('Preview params (params) must be valid JSON object');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('rejects blank templateId (%j) without transport', async (value) => {
    const { send, httpRequest } = createHarness({
      resource: 'templates',
      operation: 'previewTemplate',
      templateId: value,
      params,
    });
    await expect(send()).rejects.toThrow('Template ID (templateId) must be a nonblank string');
    expect(httpRequest).not.toHaveBeenCalled();
  });
});
