import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { PullRequestOpenedEvent, PullRequestClosedEvent, GitHubPullRequestMessageContent } from './types';
import type { GitHubPullRequestMessageContentData } from './schema';

type AllTypes = PullRequestOpenedEvent | PullRequestClosedEvent;

export function githubTransform(this: IExecuteFunctions, index: number): GitHubPullRequestMessageContent {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload: AllTypes =
    typeof rawPayload === 'string' ? (JSON.parse(rawPayload) as AllTypes) : (rawPayload as AllTypes);

  const data = {
    event: payload.action,
    title: payload.pull_request.title,
    repo: payload.repository.full_name,
    author: payload.pull_request.user.login,
    url: payload.pull_request.html_url,
    body: payload.pull_request.body ?? undefined,
  };

  return createGitHubPullRequestTemplateContent(data);
}

export function createGitHubPullRequestTemplateContent(
  data: GitHubPullRequestMessageContentData,
): GitHubPullRequestMessageContent {
  return {
    kind: 'template',
    template: 'github_pr',
    data,
  };
}
