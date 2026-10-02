import { describe, expect, it } from 'vitest';
import { includeNotifyAuth } from '../../nodes/Notify/shared/requestOptions';
import { apiKey, baseUrl, createHarness } from './helpers';

const notificationId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const scheduledTime = '2027-06-01T16:00:00Z';

const genericPayload = {
  email: {
    recipients: { to: ['citizen@example.com'] },
    content: { subject: 'Your permit application', body: 'Hello {{firstName}}' },
  },
  params: { firstName: 'Alice' },
};

const emailPayload = {
  recipients: { to: ['citizen@example.com'], cc: ['caseworker@example.com'] },
  content: { subject: 'Your permit application', body: 'Your application has been received.' },
  params: { firstName: 'Alice' },
};

const smsPayload = {
  sms: {
    recipients: { to: ['+12505550123'] },
    content: { body: 'Your appointment is confirmed for 09:00 tomorrow.' },
  },
};

describe('Notify Send / Send notification', () => {
  it('shows only its payload and preview inputs', () => {
    const { visible } = createHarness({ resource: 'send', operation: 'sendNotification' });
    expect(visible('operation')).toHaveLength(1);
    expect(visible('payload')).toHaveLength(1);
    expect(visible('preview')).toHaveLength(1);
    expect(visible('emailPayload')).toHaveLength(0);
    expect(visible('smsPayload')).toHaveLength(0);
    expect(visible('notificationId')).toHaveLength(0);
    expect(visible('scheduledTime')).toHaveLength(0);
  });

  it('resolves POST without preview query and preserves JSON body with auth', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'send',
      operation: 'sendNotification',
      payload: genericPayload,
      preview: false,
    });
    const request = await send();
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/api/v1/notifysimple');
    expect(request.baseURL).toBe(baseUrl);
    expect(request.body).toEqual(genericPayload);
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
  });

  it('renders ?preview=true only when true', async () => {
    const off = await createHarness({
      resource: 'send',
      operation: 'sendNotification',
      payload: genericPayload,
      preview: false,
    }).send();
    expect(off.url).toBe('/api/v1/notifysimple');

    const on = await createHarness({
      resource: 'send',
      operation: 'sendNotification',
      payload: genericPayload,
      preview: true,
    }).send();
    expect(on.url).toBe('/api/v1/notifysimple?preview=true');
    expect(on.body).toEqual(genericPayload);
    expect(on.headers?.['X-API-KEY']).toBe(apiKey);
  });

  it('parses string JSON payloads', async () => {
    const { send } = createHarness({
      resource: 'send',
      operation: 'sendNotification',
      payload: JSON.stringify(genericPayload),
      preview: false,
    });
    expect((await send()).body).toEqual(genericPayload);
  });

  it('rejects a bare channel without transport', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'send',
      operation: 'sendNotification',
      payload: emailPayload,
      preview: false,
    });
    await expect(send()).rejects.toThrow('at least one of email/sms/msgApp');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it.each(['{}', '   ', '{"foo": 1}', '{"params": {"firstName": "Alice"}}'])(
    'rejects a payload without any channel (%j) without transport',
    async (payload) => {
      const { send, httpRequest } = createHarness({
        resource: 'send',
        operation: 'sendNotification',
        payload,
        preview: false,
      });
      await expect(send()).rejects.toThrow('at least one of email/sms/msgApp');
      expect(httpRequest).not.toHaveBeenCalled();
    },
  );
});

describe('Notify Send / Send email', () => {
  it('shows only its payload and preview inputs', () => {
    const { visible } = createHarness({ resource: 'send', operation: 'sendEmail' });
    expect(visible('emailPayload')).toHaveLength(1);
    expect(visible('preview')).toHaveLength(1);
    expect(visible('payload')).toHaveLength(0);
    expect(visible('smsPayload')).toHaveLength(0);
    expect(visible('notificationId')).toHaveLength(0);
  });

  it('resolves POST /email with body and auth, preview only when true', async () => {
    const off = await createHarness({
      resource: 'send',
      operation: 'sendEmail',
      emailPayload,
      preview: false,
    }).send();
    expect(off.method).toBe('POST');
    expect(off.url).toBe('/api/v1/notifysimple/email');
    expect(off.body).toEqual(emailPayload);
    expect(off.headers?.['X-API-KEY']).toBe(apiKey);

    const on = await createHarness({
      resource: 'send',
      operation: 'sendEmail',
      emailPayload,
      preview: true,
    }).send();
    expect(on.url).toBe('/api/v1/notifysimple/email?preview=true');
    expect(on.body).toEqual(emailPayload);
  });

  it('rejects a wrapped full request without transport', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'send',
      operation: 'sendEmail',
      emailPayload: genericPayload,
    });
    await expect(send()).rejects.toThrow('without an "email" wrapper');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it.each(['{}', '   ', '{"content": {"subject": "Hi", "body": "Hello"}}'])(
    'rejects a payload without recipients (%j) without transport',
    async (emailPayload) => {
      const { send, httpRequest } = createHarness({
        resource: 'send',
        operation: 'sendEmail',
        emailPayload,
      });
      await expect(send()).rejects.toThrow('must include recipients');
      expect(httpRequest).not.toHaveBeenCalled();
    },
  );
});

describe('Notify Send / Send SMS', () => {
  it('shows only its payload and preview inputs', () => {
    const { visible } = createHarness({ resource: 'send', operation: 'sendSms' });
    expect(visible('smsPayload')).toHaveLength(1);
    expect(visible('preview')).toHaveLength(1);
    expect(visible('payload')).toHaveLength(0);
    expect(visible('emailPayload')).toHaveLength(0);
    expect(visible('notificationId')).toHaveLength(0);
  });

  it('resolves POST /sms with body and auth, preview only when true', async () => {
    const off = await createHarness({
      resource: 'send',
      operation: 'sendSms',
      smsPayload,
      preview: false,
    }).send();
    expect(off.method).toBe('POST');
    expect(off.url).toBe('/api/v1/notifysimple/sms');
    expect(off.body).toEqual(smsPayload);
    expect(off.headers?.['X-API-KEY']).toBe(apiKey);

    const on = await createHarness({
      resource: 'send',
      operation: 'sendSms',
      smsPayload,
      preview: true,
    }).send();
    expect(on.url).toBe('/api/v1/notifysimple/sms?preview=true');
    expect(on.body).toEqual(smsPayload);
  });

  it.each([
    ['{}', 'with an "sms" channel'],
    ['{"recipients": {"to": ["+12505550123"]}}', 'with an "sms" channel'],
    ['{"email": {"recipients": {"to": ["a@example.com"]}}}', 'belongs to the matching Send operation'],
    ['{"msgApp": {"recipients": {"to": ["+12505550123"]}}}', 'belongs to the matching Send operation'],
    ['{"sms": {"recipients": {"to": ["+12505550123"]}}, "email": {}}', 'belongs to the matching Send operation'],
  ])('rejects a non-SMS body (%j) without transport', async (smsPayload, message) => {
    const { send, httpRequest } = createHarness({
      resource: 'send',
      operation: 'sendSms',
      smsPayload,
    });
    await expect(send()).rejects.toThrow(message);
    expect(httpRequest).not.toHaveBeenCalled();
  });
});

describe('Notify Send / Cancel or reschedule', () => {
  it('shows notificationId and action, scheduledTime only for reschedule', () => {
    const cancel = createHarness({
      resource: 'send',
      operation: 'cancelOrReschedule',
      notificationId,
      action: 'cancel',
    });
    expect(cancel.visible('notificationId')).toHaveLength(1);
    expect(cancel.visible('notificationId')[0].required).toBe(true);
    expect(cancel.visible('action')).toHaveLength(1);
    expect(cancel.visible('scheduledTime')).toHaveLength(0);
    expect(cancel.visible('preview')).toHaveLength(0);
    expect(cancel.visible('payload')).toHaveLength(0);

    const reschedule = createHarness({
      resource: 'send',
      operation: 'cancelOrReschedule',
      notificationId,
      action: 'reschedule',
      scheduledTime,
    });
    expect(reschedule.visible('scheduledTime')).toHaveLength(1);
  });

  it('cancel resolves PATCH with id interpolation and {"action":"cancel"}', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'send',
      operation: 'cancelOrReschedule',
      notificationId,
      action: 'cancel',
    });
    const request = await send();
    expect(request.method).toBe('PATCH');
    expect(request.url).toBe(`/api/v1/notifysimple/${notificationId}`);
    expect(request.body).toEqual({ action: 'cancel' });
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
  });

  it('reschedule resolves PATCH with {"scheduledTime":"..."}', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'send',
      operation: 'cancelOrReschedule',
      notificationId,
      action: 'reschedule',
      scheduledTime,
    });
    const request = await send();
    expect(request.method).toBe('PATCH');
    expect(request.url).toBe(`/api/v1/notifysimple/${notificationId}`);
    expect(request.body).toEqual({ scheduledTime });
    expect(request.headers?.['X-API-KEY']).toBe(apiKey);
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
  });

  it.each(['', '   '])('rejects blank notificationId (%j) without transport', async (value) => {
    const { send, httpRequest } = createHarness({
      resource: 'send',
      operation: 'cancelOrReschedule',
      notificationId: value,
      action: 'cancel',
    });
    await expect(send()).rejects.toThrow('Notification ID (notificationId) must be a nonblank string');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it('rejects missing scheduledTime on reschedule without transport', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'send',
      operation: 'cancelOrReschedule',
      notificationId,
      action: 'reschedule',
      scheduledTime: '',
    });
    await expect(send()).rejects.toThrow('Scheduled time (scheduledTime) must be a nonblank string');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['tomorrow', 'must be a valid date-time'],
    ['2027-13-45T99:99:99Z', 'must be a valid date-time'],
    ['2027-06-01T16:00:00', 'must include a timezone'],
    ['2027-06-01 16:00:00', 'must include a timezone'],
    ['2020-01-01T00:00:00Z', 'must be in the future'],
  ])('rejects unusable scheduledTime (%j) without transport', async (scheduledTime, message) => {
    const { send, httpRequest } = createHarness({
      resource: 'send',
      operation: 'cancelOrReschedule',
      notificationId,
      action: 'reschedule',
      scheduledTime,
    });
    await expect(send()).rejects.toThrow(message);
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it.each(['2027-06-01T16:00:00+02:00', '2027-06-01T16:00:00.000-0500'])(
    'accepts timezone offsets (%j)',
    async (scheduledTime) => {
      const { send } = createHarness({
        resource: 'send',
        operation: 'cancelOrReschedule',
        notificationId,
        action: 'reschedule',
        scheduledTime,
      });
      expect((await send()).body).toEqual({ scheduledTime });
    },
  );

  it.each([undefined, null, '', ' \t ', 123, false, {}, []])(
    'rejects invalid notificationId (%j) in pre-send without mutating the request',
    async (value) => {
      const { context } = createHarness({
        resource: 'send',
        operation: 'cancelOrReschedule',
        notificationId: value,
        action: 'cancel',
      });
      const headers = Object.freeze({ Accept: 'application/json' });
      const request = { url: `/api/v1/notifysimple/x`, headers };
      await expect(includeNotifyAuth.call(context, request)).rejects.toThrow(
        'Notification ID (notificationId) must be a nonblank string',
      );
      expect(request).toEqual({ url: `/api/v1/notifysimple/x`, headers });
    },
  );

  it('uses current-item expressions for notificationId interpolation', async () => {
    const { send } = createHarness(
      {
        resource: 'send',
        operation: 'cancelOrReschedule',
        notificationId: '={{ $json.id }}',
        action: 'cancel',
      },
      {},
      { id: notificationId },
    );
    const request = await send();
    expect(request.url).toBe(`/api/v1/notifysimple/${notificationId}`);
    expect(request.body).toEqual({ action: 'cancel' });
  });
});

describe('Notify Send failure pairing', () => {
  it('pairs a transport rejection for Continue On Fail', async () => {
    const { send, httpRequest } = createHarness({
      resource: 'send',
      operation: 'sendSms',
      smsPayload,
      preview: false,
    });
    const apiError = Object.assign(new Error('SMS is not enabled for this tenant'), { statusCode: 403 });
    httpRequest.mockRejectedValueOnce(apiError);

    await expect(send()).rejects.toThrow('SMS is not enabled for this tenant');
    expect(httpRequest).toHaveBeenCalledTimes(1);

    // RoutingNode with continueOnFail pairs the rejection with the item index.
    httpRequest.mockRejectedValueOnce(apiError);
    let paired: unknown;
    try {
      await send();
    } catch (error) {
      paired = [{ json: { error: (error as Error).message }, pairedItem: { item: 0 } }];
    }
    expect(paired).toEqual([{ json: { error: 'SMS is not enabled for this tenant' }, pairedItem: { item: 0 } }]);
  });
});
