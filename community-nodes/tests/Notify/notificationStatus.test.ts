import { describe, expect, it } from 'vitest';
import { includeNotifyAuth } from '../../nodes/Notify/shared/requestOptions';
import { apiKey, baseUrl, createHarness, description } from './helpers';

const notificationId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function statusOperations() {
  const selector = description.properties.find(
    (property) =>
      property.name === 'operation' && property.displayOptions?.show?.resource?.includes('notificationStatus'),
  );
  return selector?.options ?? [];
}

function operationDescription(value: string): string {
  const option = statusOperations().find((entry) => entry.value === value);
  return typeof option?.description === 'string' ? option.description : '';
}

describe('Notify Notification status operations', () => {
  it('exposes the three status operations with GET routes', () => {
    const values = statusOperations().map((entry) => entry.value);
    expect(values).toEqual(['listNotificationRequests', 'listDeliveryRecords', 'getDeliveryRecords']);
    const routes = new Map(
      statusOperations().map((entry) => [
        entry.value,
        {
          method: entry.routing?.request?.method,
          url: entry.routing?.request?.url,
        },
      ]),
    );
    expect(routes.get('listNotificationRequests')).toEqual({
      method: 'GET',
      url: '=/api/v1/notification_request',
    });
    expect(routes.get('listDeliveryRecords')).toEqual({
      method: 'GET',
      url: '=/api/v1/notification_request/request_details',
    });
    expect(routes.get('getDeliveryRecords')).toEqual({
      method: 'GET',
      url: '=/api/v1/notification_request/{{$parameter.notificationId}}/request_details',
    });
  });

  it('documents notifyId-to-id correlation and filter format', () => {
    expect(operationDescription('listNotificationRequests')).toMatch(/notifyId/i);
    expect(operationDescription('listNotificationRequests')).toMatch(/\bid\b/);
    expect(operationDescription('listNotificationRequests')).toContain('status:eq:QUEUED');
    expect(operationDescription('listDeliveryRecords')).toMatch(/notifyId/i);
    expect(operationDescription('getDeliveryRecords')).toMatch(/notifyId/i);
    expect(operationDescription('getDeliveryRecords')).toMatch(/notificationId/);

    const filters = description.properties.find((property) => property.name === 'filters');
    expect(filters?.type).toBe('fixedCollection');
    expect(filters?.description).toContain('status:eq:QUEUED');
    expect(filters?.description).toMatch(/repeated filter/i);

    const page = description.properties.find((property) => property.name === 'page');
    const limit = description.properties.find((property) => property.name === 'limit');
    const sort = description.properties.find((property) => property.name === 'sort');
    expect(page?.type).toBe('number');
    expect(limit?.type).toBe('number');
    expect(sort?.type).toBe('string');
  });
});

describe('Notify Notification status visibility', () => {
  it('shows pagination only for list requests and hides notificationId', () => {
    const { visible, getNodeParameter } = createHarness({
      resource: 'notificationStatus',
      operation: 'listNotificationRequests',
      page: 2,
      limit: 25,
      sort: '-createdAt,status',
      filters: { filter: [{ filter: 'status:eq:QUEUED' }] },
    });
    expect(visible('operation')).toHaveLength(1);
    expect(visible('page')).toHaveLength(1);
    expect(visible('limit')).toHaveLength(1);
    expect(visible('sort')).toHaveLength(1);
    expect(visible('filters')).toHaveLength(1);
    expect(visible('notificationId')).toHaveLength(0);
    expect(getNodeParameter).not.toHaveBeenCalledWith('notificationId', expect.anything());
  });

  it('hides pagination and notificationId for list delivery records', () => {
    const { visible } = createHarness({
      resource: 'notificationStatus',
      operation: 'listDeliveryRecords',
    });
    expect(visible('operation')).toHaveLength(1);
    expect(visible('notificationId')).toHaveLength(0);
    expect(visible('page')).toHaveLength(0);
    expect(visible('limit')).toHaveLength(0);
    expect(visible('sort')).toHaveLength(0);
    expect(visible('filters')).toHaveLength(0);
  });

  it('shows required notificationId only for get delivery records', () => {
    const list = createHarness({
      resource: 'notificationStatus',
      operation: 'listNotificationRequests',
    });
    expect(list.visible('notificationId')).toHaveLength(0);

    const all = createHarness({
      resource: 'notificationStatus',
      operation: 'listDeliveryRecords',
    });
    expect(all.visible('notificationId')).toHaveLength(0);

    const detail = createHarness({
      resource: 'notificationStatus',
      operation: 'getDeliveryRecords',
      notificationId,
    });
    expect(detail.visible('notificationId')).toHaveLength(1);
    expect(detail.visible('notificationId')[0].required).toBe(true);
    expect(detail.visible('page')).toHaveLength(0);
    expect(detail.visible('limit')).toHaveLength(0);
    expect(detail.visible('sort')).toHaveLength(0);
    expect(detail.visible('filters')).toHaveLength(0);
  });
});

describe('Notify Notification status / List notification requests', () => {
  it('resolves GET with page/limit/sort/repeated-filter qs and auth', async () => {
    const { send, httpRequest, getNodeParameter } = createHarness({
      resource: 'notificationStatus',
      operation: 'listNotificationRequests',
      page: 2,
      limit: 25,
      sort: '-createdAt,status',
      filters: {
        filter: [{ filter: 'status:eq:QUEUED' }, { filter: 'createdAt:gte:2026-01-01T00:00:00.000Z' }],
      },
    });
    const request = await send();
    expect(request.method).toBe('GET');
    expect(request.url).toBe('/api/v1/notification_request');
    expect(request.baseURL).toBe(baseUrl);
    expect(request.qs).toEqual({
      page: 2,
      limit: 25,
      sort: '-createdAt,status',
      filter: ['status:eq:QUEUED', 'createdAt:gte:2026-01-01T00:00:00.000Z'],
    });
    expect(request.arrayFormat).toBe('repeat');
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
    expect(getNodeParameter.mock.calls.some(([name]) => name === 'notificationId')).toBe(false);
  });

  it('omits empty sort and filter while keeping page/limit', async () => {
    const { send } = createHarness({
      resource: 'notificationStatus',
      operation: 'listNotificationRequests',
      page: 1,
      limit: 10,
      sort: '',
      filters: {},
    });
    const request = await send();
    expect(request.method).toBe('GET');
    expect(request.url).toBe('/api/v1/notification_request');
    expect(request.qs).toEqual({ page: 1, limit: 10 });
    expect(request.arrayFormat).toBeUndefined();
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
  });

  it('accepts singular filter string collections', async () => {
    const { send } = createHarness({
      resource: 'notificationStatus',
      operation: 'listNotificationRequests',
      page: 1,
      limit: 10,
      sort: '',
      filter: ['status:eq:QUEUED'],
    });
    const request = await send();
    expect(request.qs).toMatchObject({ filter: ['status:eq:QUEUED'] });
    expect(request.arrayFormat).toBe('repeat');
  });
});

describe('Notify Notification status / List delivery records', () => {
  it('resolves GET request_details with auth and no id or qs', async () => {
    const { send, httpRequest, getNodeParameter } = createHarness({
      resource: 'notificationStatus',
      operation: 'listDeliveryRecords',
    });
    const request = await send();
    expect(request.method).toBe('GET');
    expect(request.url).toBe('/api/v1/notification_request/request_details');
    expect(request.baseURL).toBe(baseUrl);
    expect(request.qs).toBeUndefined();
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
    expect(getNodeParameter.mock.calls.some(([name]) => name === 'notificationId')).toBe(false);
  });
});

describe('Notify Notification status / Get delivery records', () => {
  it('resolves GET with id interpolation and auth', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'notificationStatus',
      operation: 'getDeliveryRecords',
      notificationId,
    });
    const request = await send();
    expect(request.method).toBe('GET');
    expect(request.url).toBe(`/api/v1/notification_request/${notificationId}/request_details`);
    expect(request.baseURL).toBe(baseUrl);
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
  });

  it.each(['', '   '])('rejects blank notificationId (%j) without transport', async (value) => {
    const { send, httpRequest } = createHarness({
      resource: 'notificationStatus',
      operation: 'getDeliveryRecords',
      notificationId: value,
    });
    await expect(send()).rejects.toThrow('Notification ID (notificationId) must be a nonblank string');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 123, false, {}, []])(
    'rejects invalid notificationId (%j) in pre-send without mutating the request',
    async (value) => {
      const { context } = createHarness({
        resource: 'notificationStatus',
        operation: 'getDeliveryRecords',
        notificationId: value,
      });
      const headers = Object.freeze({ Accept: 'application/json' });
      const request = { url: '/api/v1/notification_request/x/request_details', headers };
      await expect(includeNotifyAuth.call(context, request)).rejects.toThrow(
        'Notification ID (notificationId) must be a nonblank string',
      );
      expect(request).toEqual({ url: '/api/v1/notification_request/x/request_details', headers });
    },
  );

  it('uses current-item expressions for notificationId interpolation', async () => {
    const { send } = createHarness(
      {
        resource: 'notificationStatus',
        operation: 'getDeliveryRecords',
        notificationId: '={{ $json.id }}',
      },
      {},
      { id: notificationId },
    );
    const request = await send();
    expect(request.url).toBe(`/api/v1/notification_request/${notificationId}/request_details`);
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
  });
});
