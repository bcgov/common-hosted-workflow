import { describe, expect, it } from 'vitest';

import { executeNode, expectPostedToDevX, getSentContent, setupDevXConnectorEnv } from './helpers';

describe('DevXMessageConnector html', () => {
  setupDevXConnectorEnv();

  it('sanitizes html payloads before posting', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'html',
        payload: '<p>Allowed</p><script>alert(1)</script><a href="javascript:alert(1)">Blocked</a>',
      },
    ]);

    expectPostedToDevX(requestOptions);

    const content = getSentContent(requestOptions) as { kind: string; text: string };
    expect(content.kind).toBe('html');
    expect(content.text).toContain('<p>Allowed</p>');
    expect(content.text).not.toContain('<script');
    expect(content.text).not.toContain('javascript:');
  });

  it('stringifies non-string html payloads before posting', async () => {
    const payload = { message: '<b>bold</b>', state: 'ok' };
    const { requestOptions } = await executeNode([{ type: 'html', payload }]);

    expectPostedToDevX(requestOptions);

    const content = getSentContent(requestOptions) as { kind: string; text: string };
    expect(content).toEqual({
      kind: 'html',
      text: JSON.stringify(payload),
    });
  });

  it('strips disallowed protocols and protocol-relative URLs from html payloads', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'html',
        payload:
          '<a href="ftp://example.com/file.txt">FTP</a><img src="//example.com/image.png" alt="bad" /><a href="https://example.com/page">Safe</a>',
      },
    ]);

    expectPostedToDevX(requestOptions);

    const content = getSentContent(requestOptions) as { kind: string; text: string };
    expect(content.kind).toBe('html');
    expect(content.text).not.toContain('ftp://example.com/file.txt');
    expect(content.text).not.toContain('//example.com/image.png');
    expect(content.text).toContain('https://example.com/page');
  });
});
