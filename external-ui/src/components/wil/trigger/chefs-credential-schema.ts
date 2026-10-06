import { z } from 'zod';

/**
 * Client-side rules for the CHEFS credential dialog. Keep in step with
 * `external-hooks/src/api/schemas/chefs-credential.ts` so the form rejects
 * exactly what the API would.
 */
const NAME_MESSAGE = 'Credential name must be 3 to 128 characters';

const sharedFields = {
  name: z.string().trim().min(3, NAME_MESSAGE).max(128, NAME_MESSAGE),
  formName: z.string().trim().min(1, 'Form name is required'),
  baseUrl: z.string().trim().url('Enter a valid URL'),
  formId: z.string().trim().min(1, 'Form ID is required'),
};

export const createChefsCredentialFormSchema = z.object({
  ...sharedFields,
  apiKey: z.string().trim().min(1, 'API key is required'),
});

/** On edit a blank API key keeps the stored one. */
export const editChefsCredentialFormSchema = z.object({
  ...sharedFields,
  apiKey: z.string().trim(),
});

export type ChefsCredentialFormValues = z.infer<typeof createChefsCredentialFormSchema>;
