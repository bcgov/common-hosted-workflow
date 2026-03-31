import { describe, expect, it } from 'vitest';

import {
  createExecutionContext,
  createNode,
  executeNode,
  expectPostedToDevX,
  getSentContent,
  setupDevXConnectorEnv,
} from './helpers';

describe('DevXMessageConnector sysdig', () => {
  setupDevXConnectorEnv();

  it('formats sysdig timestamps and nullable fields in the sysdig template', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'template',
        source: 'sysdig',
        payload: {
          timestamp: '2024-01-02T03:04:05.678Z',
          state: 'active',
          alert: {
            severity: 4,
            editUrl: 'https://app.sysdig.com/alerts/1',
            name: 'Container CPU High',
            scope: null,
            description: null,
          },
        },
      },
    ]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'template',
      template: 'sysdig',
      data: {
        severity: 4,
        state: 'ACTIVE',
        alertName: 'Container CPU High',
        scope: undefined,
        description: undefined,
        timestamp: '2024-01-02T03:04:05Z',
        url: 'https://app.sysdig.com/alerts/1',
      },
    });
  });

  it('throws when sysdig provides an invalid timestamp', async () => {
    const node = createNode();
    const context = createExecutionContext([
      {
        type: 'template',
        source: 'sysdig',
        payload: {
          timestamp: 'invalid-date',
          state: 'ACTIVE',
          alert: {
            severity: 4,
            editUrl: 'https://app.sysdig.com/alerts/1',
            name: 'Container CPU High',
            scope: null,
            description: null,
          },
        },
      },
    ]);

    await expect(node.execute.call(context as never)).rejects.toThrow('Invalid date input: invalid-date');
    expect(context.helpers.httpRequest).not.toHaveBeenCalled();
  });
});
