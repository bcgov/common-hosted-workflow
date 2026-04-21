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

  it('maps status cake UP payloads into the uptime template', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'template',
        source: 'status-cake',
        payload: {
          Status: 'UP',
          Name: 'Website Name',
        },
      },
    ]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'template',
      template: 'uptime',
      data: {
        status: 'up',
        service: 'Website Name',
      },
    });
  });

  it('maps status cake DOWN payloads into the uptime template', async () => {
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
      template: 'uptime',
      data: {
        status: 'down',
        service: 'API Health Check',
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

  it('throws when status cake is missing Name', async () => {
    const node = createNode();
    const context = createExecutionContext([
      {
        type: 'template',
        source: 'status-cake',
        payload: {
          Status: 'UP',
        },
      },
    ]);

    await expect(node.execute.call(context as never)).rejects.toThrow();
    expect(context.helpers.httpRequest).not.toHaveBeenCalled();
  });

  it('throws when status cake status is not supported by the uptime schema', async () => {
    const node = createNode();
    const context = createExecutionContext([
      {
        type: 'template',
        source: 'status-cake',
        payload: {
          Status: 'PAUSED',
          Name: 'Website Name',
        },
      },
    ]);

    await expect(node.execute.call(context as never)).rejects.toThrow();
    expect(context.helpers.httpRequest).not.toHaveBeenCalled();
  });
});
