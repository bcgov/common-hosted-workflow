import { describe, expect, it } from 'vitest';

import {
  createExecutionContext,
  createNode,
  executeNode,
  expectPostedToDevX,
  getSentContent,
  setupDevXConnectorEnv,
} from './helpers';

describe('DevXMessageConnector uptime-com', () => {
  setupDevXConnectorEnv();

  it('maps uptime payloads into the uptime template', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'template',
        source: 'uptime-com',
        payload: {
          data: {
            alert: {
              is_up: false,
              created_at: '2024-02-03T04:05:06.789Z',
            },
            service: {
              display_name: 'Workflow API',
            },
            links: {
              alert_details: 'https://uptime.com/alerts/1',
            },
          },
        },
      },
    ]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'template',
      template: 'uptime',
      data: {
        status: 'down',
        service: 'Workflow API',
        downSince: '2024-02-03T04:05:06Z',
        url: 'https://uptime.com/alerts/1',
      },
    });
  });

  it('throws when an uptime-com payload fails schema validation', async () => {
    const node = createNode();
    const context = createExecutionContext([
      {
        type: 'template',
        source: 'uptime-com',
        payload: {
          data: {
            alert: {
              is_up: true,
              created_at: '2024-02-03T04:05:06.789Z',
            },
            service: {
              display_name: 'Workflow API',
            },
            links: {
              alert_details: 'not-a-url',
            },
          },
        },
      },
    ]);

    await expect(node.execute.call(context as never)).rejects.toThrow();
    expect(context.helpers.httpRequest).not.toHaveBeenCalled();
  });
});
