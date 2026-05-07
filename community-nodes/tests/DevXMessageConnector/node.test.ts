import { describe, expect, it } from 'vitest';

import {
  createExecutionContext,
  createNode,
  executeNode,
  getSentContent,
  setupDevXConnectorEnv,
  suppressConsoleError,
} from './helpers';

describe('DevXMessageConnector node', () => {
  setupDevXConnectorEnv();

  it('throws when the teams channel link is invalid', async () => {
    const consoleError = suppressConsoleError();
    const node = createNode();
    const context = createExecutionContext([{ type: 'text', payload: 'Hello DevX' }], 'not-a-url');

    await expect(node.execute.call(context as never)).rejects.toThrow('Invalid Microsoft Teams channel link provided');
    expect(context.helpers.httpRequest).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });

  it('processes multiple items with mixed source types in a single execute call', async () => {
    const { result, requestOptionsList } = await executeNode([
      { type: 'text', payload: 'Plain text message' },
      {
        type: 'template',
        source: 'generic',
        payload: {
          title: 'Deployment complete',
          severity: 'success',
        },
      },
      {
        type: 'template',
        source: 'github',
        payload: {
          action: 'completed',
          repository: { full_name: 'bcgov/common-hosted-workflow' },
          workflow_run: {
            conclusion: 'success',
            name: 'CI',
            head_branch: 'main',
            html_url: 'https://github.com/bcgov/common-hosted-workflow/actions/runs/2',
            head_sha: '123456abcdef', // pragma: allowlist secret
            head_commit: { message: 'Ship it' },
            triggering_actor: { login: 'ci-bot' },
          },
        },
      },
    ]);

    expect(requestOptionsList).toHaveLength(3);
    expect(getSentContent(requestOptionsList[0])).toEqual({
      kind: 'text',
      text: 'Plain text message',
    });
    expect(getSentContent(requestOptionsList[1])).toEqual({
      kind: 'template',
      template: 'generic',
      data: {
        title: 'Deployment complete',
        severity: 'success',
      },
    });
    expect(getSentContent(requestOptionsList[2])).toEqual({
      kind: 'template',
      template: 'github_workflow_run',
      data: {
        event: 'completed',
        conclusion: 'success',
        workflow: 'CI',
        repo: 'bcgov/common-hosted-workflow',
        branch: 'main',
        author: 'ci-bot',
        url: 'https://github.com/bcgov/common-hosted-workflow/actions/runs/2',
        sha: '123456abcdef', // pragma: allowlist secret
        message: 'Ship it',
      },
    });
    expect(result).toEqual([[{ json: { ok: true } }, { json: { ok: true } }, { json: { ok: true } }]]);
  });

  it('serializes circular http responses before returning execution data', async () => {
    const node = createNode();
    const context = createExecutionContext([{ type: 'text', payload: 'Hello DevX' }]);
    const httpMessage: Record<string, unknown> = {};
    const response = {
      ok: true,
      res: {
        socket: {
          _httpMessage: httpMessage,
        },
      },
    };

    httpMessage.res = response.res;
    context.helpers.httpRequest.mockResolvedValueOnce(response);

    await expect(node.execute.call(context as never)).resolves.toEqual([
      [
        {
          json: {
            ok: true,
            res: {
              socket: {
                _httpMessage: {
                  res: '[Circular]',
                },
              },
            },
          },
        },
      ],
    ]);
  });

  it('wraps circular http request errors before they reach execution persistence', async () => {
    const consoleError = suppressConsoleError();
    const node = createNode();
    const context = createExecutionContext([{ type: 'text', payload: 'Hello DevX' }]);
    const httpMessage: Record<string, unknown> = {};
    const request = {
      res: {
        socket: {
          _httpMessage: httpMessage,
        },
      },
    };
    const apiError = Object.assign(new Error('Forbidden'), {
      response: { status: 403 },
      request,
    });

    httpMessage.request = request;
    context.helpers.httpRequest.mockRejectedValueOnce(apiError);

    await expect(node.execute.call(context as never)).rejects.toThrow('Forbidden');
    expect(consoleError).toHaveBeenCalledWith('DevX Connector request failed', {
      url: 'https://devx.example/api/v1/messages',
      mode: 'send',
      status: 403,
      statusText: undefined,
      code: undefined,
      responseBody: {},
    });
  });

  it('logs sanitized DevX API response bodies on request failure', async () => {
    const consoleError = suppressConsoleError();
    const node = createNode();
    const context = createExecutionContext([{ type: 'text', payload: 'Hello DevX' }]);
    const errorBody: Record<string, unknown> = { message: 'Bad gateway' };
    const httpMessage: Record<string, unknown> = {};

    errorBody.self = errorBody;
    httpMessage.body = errorBody;

    context.helpers.httpRequest.mockRejectedValueOnce(
      Object.assign(new Error('Bad gateway'), {
        code: 'ERR_BAD_RESPONSE',
        response: {
          status: 502,
          statusText: 'Bad Gateway',
          data: {
            error: errorBody,
            request: {
              res: {
                socket: {
                  _httpMessage: httpMessage,
                },
              },
            },
          },
        },
      }),
    );

    await expect(node.execute.call(context as never)).rejects.toThrow('Bad gateway');
    expect(consoleError).toHaveBeenCalledWith('DevX Connector request failed', {
      url: 'https://devx.example/api/v1/messages',
      mode: 'send',
      status: 502,
      statusText: 'Bad Gateway',
      code: 'ERR_BAD_RESPONSE',
      responseBody: {
        error: {
          message: 'Bad gateway',
          self: '[Circular]',
        },
        request: {
          res: {
            socket: {
              _httpMessage: {
                body: '[Circular]',
              },
            },
          },
        },
      },
    });
  });
});
