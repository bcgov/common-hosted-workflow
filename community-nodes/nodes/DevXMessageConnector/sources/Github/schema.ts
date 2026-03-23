import { z } from 'zod';

export const gitHubPullRequestMessageContentDataSchema = z
  .object({
    event: z.string().min(1),
    title: z.string().min(1),
    repo: z.string().min(1),
    author: z.string().min(1),
    url: z.string().url(),
    body: z.string().optional(),
  })
  .strict();

export type GitHubPullRequestMessageContentData = z.infer<typeof gitHubPullRequestMessageContentDataSchema>;

export const gitHubWorkflowRunMessageContentDataSchema = z.object({
  event: z.string().min(1),
  conclusion: z.string().optional(),
  workflow: z.string().min(1).max(200),
  repo: z.string().min(1),
  branch: z.string().min(1),
  author: z.string().min(1),
  url: z.string().url(),
  sha: z.string().min(1).optional(),
  message: z.string().optional(),
});

export type GitHubWorkflowRunMessageContentData = z.infer<typeof gitHubWorkflowRunMessageContentDataSchema>;
