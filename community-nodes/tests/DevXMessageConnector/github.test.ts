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

describe('DevXMessageConnector github', () => {
  setupDevXConnectorEnv();

  it('transforms github pull request payloads into the pull request template', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'template',
        source: 'github',
        payload: {
          action: 'opened',
          repository: { full_name: 'bcgov/common-hosted-workflow' },
          pull_request: {
            title: 'Add node tests',
            html_url: 'https://github.com/bcgov/common-hosted-workflow/pull/1',
            body: 'Adds coverage for DevXMessageConnector.',
            user: { login: 'octocat' },
          },
        },
      },
    ]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'template',
      template: 'github_pull_request',
      data: {
        event: 'opened',
        title: 'Add node tests',
        repo: 'bcgov/common-hosted-workflow',
        author: 'octocat',
        url: 'https://github.com/bcgov/common-hosted-workflow/pull/1',
        body: 'Adds coverage for DevXMessageConnector.',
      },
    });
  });

  it('transforms github workflow payloads into the workflow template', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'template',
        source: 'github',
        payload: {
          action: 'completed',
          repository: { full_name: 'bcgov/common-hosted-workflow' },
          workflow_run: {
            conclusion: null,
            name: 'CI',
            head_branch: 'main',
            html_url: 'https://github.com/bcgov/common-hosted-workflow/actions/runs/1',
            head_sha: 'abcdef123456', // pragma: allowlist secret
            head_commit: { message: 'Run checks' },
            triggering_actor: { login: 'ci-bot' },
          },
        },
      },
    ]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'template',
      template: 'github_workflow_run',
      data: {
        event: 'completed',
        conclusion: '',
        workflow: 'CI',
        repo: 'bcgov/common-hosted-workflow',
        branch: 'main',
        author: 'ci-bot',
        url: 'https://github.com/bcgov/common-hosted-workflow/actions/runs/1',
        sha: 'abcdef123456', // pragma: allowlist secret
        message: 'Run checks',
      },
    });
  });

  it('falls back to text content for github payloads without a supported subtype', async () => {
    const payload = { action: 'deleted', repository: { full_name: 'bcgov/common-hosted-workflow' } };
    const { requestOptions } = await executeNode([{ type: 'template', source: 'github', payload }]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual({
      kind: 'text',
      text: JSON.stringify(payload),
    });
  });

  it('throws when a github pull request payload fails schema validation', async () => {
    const node = createNode();
    const context = createExecutionContext([
      {
        type: 'template',
        source: 'github',
        payload: {
          action: 'opened',
          repository: { full_name: 'bcgov/common-hosted-workflow' },
          pull_request: {
            title: 'Broken PR payload',
            html_url: 'not-a-url',
            body: 'Bad URL should fail validation',
            user: { login: 'octocat' },
          },
        },
      },
    ]);

    await expect(node.execute.call(context as never)).rejects.toThrow();
    expect(context.helpers.httpRequest).not.toHaveBeenCalled();
  });

  it('throws when a github payload string cannot be parsed', async () => {
    const consoleError = suppressConsoleError();
    const node = createNode();
    const context = createExecutionContext([{ type: 'template', source: 'github', payload: 'not-json' }]);

    await expect(node.execute.call(context as never)).rejects.toThrow('Failed to generate message content');
    expect(context.helpers.httpRequest).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });
});
