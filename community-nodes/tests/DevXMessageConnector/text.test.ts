import { describe, expect, it } from 'vitest';

import { executeNode, expectPostedToDevX, getSentContent, setupDevXConnectorEnv } from './helpers';

describe('DevXMessageConnector text', () => {
  setupDevXConnectorEnv();

  it('posts text payloads as text content', async () => {
    const { requestOptions, result } = await executeNode([{ type: 'text', payload: 'Hello DevX' }]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'text',
      text: 'Hello DevX',
    });
    expect(result).toEqual([[{ json: { ok: true } }]]);
  });

  it('stringifies non-string text payloads before posting', async () => {
    const payload = { status: 'ok', count: 2 };
    const { requestOptions } = await executeNode([{ type: 'text', payload }]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'text',
      text: JSON.stringify(payload),
    });
  });

  it('stringifies primitive text payloads before posting', async () => {
    const { requestOptions } = await executeNode([{ type: 'text', payload: false }]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'text',
      text: 'false',
    });
  });
});
