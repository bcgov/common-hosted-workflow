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

describe('DevXMessageConnector rocket-chat', () => {
  setupDevXConnectorEnv();

  it('renders rocket chat attachments into sanitized html', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'template',
        source: 'rocket-chat',
        payload: JSON.stringify({
          text: 'Primary update',
          attachments: [
            {
              title: 'View alert',
              title_link: 'https://example.com/alerts/1',
              text: 'Alert details<script>alert(1)</script>',
              image_url: 'https://example.com/image.png',
              fields: [{ title: 'State', value: 'OPEN', short: true }],
            },
          ],
        }),
      },
    ]);

    expectPostedToDevX(requestOptions);

    const content = getSentContent(requestOptions) as { kind: string; text: string };
    expect(content.kind).toBe('html');
    expect(content.text).toContain('Primary update');
    expect(content.text).toContain('View alert');
    expect(content.text).toContain('Alert details');
    expect(content.text).toContain('https://example.com/image.png');
    expect(content.text).toContain('State:');
    expect(content.text).not.toContain('<script');
  });

  it('throws when a rocket chat payload string cannot be parsed', async () => {
    const consoleError = suppressConsoleError();
    const node = createNode();
    const context = createExecutionContext([{ type: 'template', source: 'rocket-chat', payload: 'not-json' }]);

    await expect(node.execute.call(context as never)).rejects.toThrow('Failed to generate message content');
    expect(context.helpers.httpRequest).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });
});
