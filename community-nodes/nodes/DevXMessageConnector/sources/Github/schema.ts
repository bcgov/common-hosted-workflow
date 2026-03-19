import { z } from 'zod';

export const gitHubPullRequestMessageContentDataSchema = z
  .object({
    event: z.string().min(1),
    title: z.string().min(1),
    repo: z.string().min(1),
    author: z.string().min(1),
    url: z.url(),
    body: z.string().optional(),
  })
  .strict();

export type GitHubPullRequestMessageContentData = z.infer<typeof gitHubPullRequestMessageContentDataSchema>;
