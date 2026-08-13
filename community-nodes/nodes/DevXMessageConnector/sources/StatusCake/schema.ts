import { z } from 'zod';

export const statusCakeMessageContentDataSchema = z.object({
  status: z.enum(['up', 'down']), // POST['Status']
  testName: z.string().min(1), // POST['Name']
  websiteUrl: z.string().url().optional(), // POST['URL']
  statusCode: z.string().optional(), // POST['StatusCode']
  ip: z.string().optional(), // POST['IP']
  tags: z.string().optional(), // POST['Tags']
  checkRate: z.string().optional(), // POST['Checkrate']
  testId: z.string().optional(), // POST['TestID']
  method: z.string().optional(), // POST['Method']
});

export type StatusCakeMessageContentData = z.infer<typeof statusCakeMessageContentDataSchema>;
