import { z } from 'zod';

export const schema = z
  .object({
    event: z.enum(['opened', 'merged', 'closed']), // is it only for pull requests?? where 'merged' comes from.
    title: z.string().min(1), // pull_request.title
    repo: z.string().min(1), // pull_request.repo.full_name
    author: z.string().min(1), // pull_request.user.login
    url: z.string().url(), // pull_request.url
    body: z.string().optional(), // pull_request.body
  })
  .strict();
