import { describe, expect, it } from 'vitest';

import { executeNode, expectPostedToDevX, getSentContent, setupDevXConnectorEnv } from './helpers';

describe('DevXMessageConnector card', () => {
  setupDevXConnectorEnv();

  it('posts adaptive card payloads as card content', async () => {
    const payload = {
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.5',
      body: [
        {
          type: 'TextBlock',
          text: 'Deployment complete',
          weight: 'Bolder',
        },
      ],
      actions: [
        {
          type: 'Action.OpenUrl',
          title: 'Open runbook',
          url: 'https://example.com/runbook',
        },
      ],
      fallbackText: 'Deployment complete',
    };

    const { requestOptions, result } = await executeNode([{ type: 'card', payload }]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'card',
      card: payload,
    });
    expect(result).toEqual([[{ json: { ok: true } }]]);
  });

  it('parses adaptive cards from JSON strings before posting', async () => {
    const payload = JSON.stringify({
      type: 'AdaptiveCard',
      custom: {
        whatever: true,
      },
      body: 'not-validated-here',
      msteams: {
        entities: 'not-validated-here',
      },
    });

    const { requestOptions } = await executeNode([{ type: 'card', payload }]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'card',
      card: {
        type: 'AdaptiveCard',
        custom: {
          whatever: true,
        },
        body: 'not-validated-here',
        msteams: {
          entities: 'not-validated-here',
        },
      },
    });
  });

  it('accepts the minimal connector card schema', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'card',
        payload: {
          type: 'AdaptiveCard',
        },
      },
    ]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'card',
      card: {
        type: 'AdaptiveCard',
      },
    });
  });
});
