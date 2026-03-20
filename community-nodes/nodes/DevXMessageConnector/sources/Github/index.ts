import { IExecuteFunctions } from 'n8n-workflow';
import type {
  PullRequestEvent,
  WorkflowRunEvent,
  GitHubPullRequestMessageContent,
  GitHubWorkflowRunMessageContent,
} from './types';
import type { GitHubPullRequestMessageContentData, GitHubWorkflowRunMessageContentData } from './schema';
import { createTextMessageContent } from '../Text';
import { TextMessageContent } from '../Text/types';
import { safeParsePayload } from '../shared/payload';

type allTypes = PullRequestEvent | WorkflowRunEvent;

export function githubTransform(
  this: IExecuteFunctions,
  index: number,
): GitHubPullRequestMessageContent | GitHubWorkflowRunMessageContent | TextMessageContent | null {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload = safeParsePayload<allTypes>(rawPayload);
  if (!payload) return null;

  if ('pull_request' in payload) {
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

  if ('workflow_run' in payload) {
    const data = {
      event: payload.action,
      conclusion: payload.workflow_run.conclusion ?? '',
      workflow: payload.workflow_run.name,
      repo: payload.repository.full_name,
      branch: payload.workflow_run.head_branch,
      author: payload.workflow_run.triggering_actor.login,
      url: payload.workflow_run.html_url,
      sha: payload.workflow_run.head_sha,
      message: payload.workflow_run.head_commit.message,
    };

    return createGitHubWorkflowRunTemplateContent(data);
  }

  const jsonStr = JSON.stringify(payload);
  return createTextMessageContent(jsonStr);
}

export function createGitHubPullRequestTemplateContent(
  data: GitHubPullRequestMessageContentData,
): GitHubPullRequestMessageContent {
  return {
    kind: 'template',
    template: 'github_pull_request',
    data,
  };
}

export function createGitHubWorkflowRunTemplateContent(
  data: GitHubWorkflowRunMessageContentData,
): GitHubWorkflowRunMessageContent {
  return {
    kind: 'template',
    template: 'github_workflow_run',
    data,
  };
}
