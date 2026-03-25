import { describe, expect, it } from 'vitest';

import {
  createExecutionContext,
  createNode,
  executeNode,
  expectPostedToDevX,
  getSentContent,
  setupDevXConnectorEnv,
  suppressConsoleError,
} from './helpers';

describe('DevXMessageConnector generic', () => {
  setupDevXConnectorEnv();

  it('posts generic template payloads from objects', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'template',
        source: 'generic',
        payload: {
          title: 'Deployment finished',
          severity: 'success',
          url: 'https://example.com/deployments/1',
        },
      },
    ]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'template',
      template: 'generic',
      data: {
        title: 'Deployment finished',
        severity: 'success',
        url: 'https://example.com/deployments/1',
      },
    });
  });

  it('throws when a generic payload cannot be parsed into message content', async () => {
    const consoleError = suppressConsoleError();
    const node = createNode();
    const context = createExecutionContext([{ type: 'template', source: 'generic', payload: 'not-json' }]);

    await expect(node.execute.call(context as never)).rejects.toThrow('Failed to generate message content');
    expect(context.helpers.httpRequest).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });
});
