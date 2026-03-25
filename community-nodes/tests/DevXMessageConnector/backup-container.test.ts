import { describe, expect, it } from 'vitest';

import {
  createExecutionContext,
  createNode,
  executeNode,
  expectPostedToDevX,
  getSentContent,
  setupDevXConnectorEnv,
} from './helpers';

describe('DevXMessageConnector backup-container', () => {
  setupDevXConnectorEnv();

  it('maps backup container status codes to the db backup template', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'template',
        source: 'backup-container',
        payload: JSON.stringify({
          projectFriendlyName: 'Common Hosted Workflow',
          projectName: 'common-hosted-workflow',
          statusCode: 'WARN',
          message: 'Backup finished with warnings',
        }),
      },
    ]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'template',
      template: 'db_backup',
      data: {
        status: 'warn',
        projectName: 'common-hosted-workflow',
        projectFriendlyName: 'Common Hosted Workflow',
        message: 'Backup finished with warnings',
      },
    });
  });

  it('throws when backup-container status is not supported by the schema', async () => {
    const node = createNode();
    const context = createExecutionContext([
      {
        type: 'template',
        source: 'backup-container',
        payload: {
          projectFriendlyName: 'Common Hosted Workflow',
          projectName: 'common-hosted-workflow',
          statusCode: 'DEBUG',
          message: 'Unsupported status',
        },
      },
    ]);

    await expect(node.execute.call(context as never)).rejects.toThrow();
    expect(context.helpers.httpRequest).not.toHaveBeenCalled();
  });
});
