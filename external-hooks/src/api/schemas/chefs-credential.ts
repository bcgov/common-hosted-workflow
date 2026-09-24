import { z } from 'zod';

/** Public CHEFS credential. The API key is never part of this shape. */
export const chefsCredentialSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  formName: z.string(),
  formId: z.string(),
  baseUrl: z.string(),
});

export type ChefsCredentialSummary = z.infer<typeof chefsCredentialSummarySchema>;

export const listChefsCredentialsResponseSchema = z.object({
  data: z.array(chefsCredentialSummarySchema),
});

/** GET /ui-api/wil/chefs-credentials */
export const listChefsCredentialsSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
});

/** POST /ui-api/wil/chefs-credentials */
export const createChefsCredentialSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z
    .object({
      name: z.string().trim().min(3, 'Credential name must be 3 to 128 characters').max(128),
      formName: z.string().trim().min(1, 'Form name is required'),
      baseUrl: z.string().trim().url('baseUrl must be a valid URL'),
      formId: z.string().trim().min(1, 'Form ID is required'),
      apiKey: z.string().trim().min(1, 'API key is required'),
    })
    .strict(),
});

export const createChefsCredentialResponseSchema = chefsCredentialSummarySchema;
