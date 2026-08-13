import { describe, expect, it } from 'vitest';

import {
  createExecutionContext,
  createNode,
  executeNode,
  expectPostedToDevX,
  getSentContent,
  setupDevXConnectorEnv,
} from './helpers';

describe('DevXMessageConnector status-cake', () => {
  setupDevXConnectorEnv();

  it('maps status cake UP payloads into the statuscake template', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'template',
        source: 'status-cake',
        payload: {
          Status: 'UP',
          URL: 'https://example.com',
          StatusCode: 200,
          IP: '127.0.0.1',
          Tags: 'prod,web',
          Name: 'Website Name',
          Checkrate: 300,
          TestID: 42,
          Method: 'GET',
        },
      },
    ]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'template',
      template: 'statuscake',
      data: {
        status: 'up',
        testName: 'Website Name',
        websiteUrl: 'https://example.com',
        statusCode: '200',
        ip: '127.0.0.1',
        tags: 'prod,web',
        checkRate: '300',
        testId: '42',
        method: 'GET',
      },
    });
  });

  it('maps status cake DOWN payloads into the statuscake template', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'template',
        source: 'status-cake',
        payload: JSON.stringify({
          Status: 'DOWN',
          Name: 'API Health Check',
        }),
      },
    ]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'template',
      template: 'statuscake',
      data: {
        status: 'down',
        testName: 'API Health Check',
      },
    });
  });

  it('throws when status cake is missing Status', async () => {
    const node = createNode();
    const context = createExecutionContext([
      {
        type: 'template',
        source: 'status-cake',
        payload: {
          Name: 'Website Name',
        },
      },
    ]);

    await expect(node.execute.call(context as never)).rejects.toThrow();
    expect(context.helpers.httpRequest).not.toHaveBeenCalled();
  });

  it('defaults missing Name values to a string placeholder', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'template',
        source: 'status-cake',
        payload: {
          Status: 'UP',
        },
      },
    ]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'template',
      template: 'statuscake',
      data: {
        status: 'up',
        testName: 'undefined',
      },
    });
  });

  it('maps unsupported status values to down', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'template',
        source: 'status-cake',
        payload: {
          Status: 'PAUSED',
          Name: 'Website Name',
        },
      },
    ]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'template',
      template: 'statuscake',
      data: {
        status: 'down',
        testName: 'Website Name',
      },
    });
  });
});
