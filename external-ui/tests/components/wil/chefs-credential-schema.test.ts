import { describe, expect, it } from 'vitest';

import {
  createChefsCredentialFormSchema,
  editChefsCredentialFormSchema,
} from '@/components/wil/trigger/chefs-credential-schema';

const VALID = {
  name: 'Intake credential',
  formName: 'Intake',
  baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
  formId: 'form-123',
  apiKey: 'secret', // pragma: allowlist secret
};

describe('CHEFS credential form schema', () => {
  it('accepts a complete credential', () => {
    expect(createChefsCredentialFormSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects a base URL that is not a URL (matches the API rule)', () => {
    const result = createChefsCredentialFormSchema.safeParse({ ...VALID, baseUrl: 'not a url' });
    expect(result.success).toBe(false);
  });

  it('rejects names shorter than 3 or longer than 128 characters', () => {
    expect(createChefsCredentialFormSchema.safeParse({ ...VALID, name: 'ab' }).success).toBe(false);
    expect(createChefsCredentialFormSchema.safeParse({ ...VALID, name: 'a'.repeat(129) }).success).toBe(false);
  });

  it('requires an API key on create but not on edit', () => {
    expect(createChefsCredentialFormSchema.safeParse({ ...VALID, apiKey: '  ' }).success).toBe(false);
    expect(editChefsCredentialFormSchema.safeParse({ ...VALID, apiKey: '' }).success).toBe(true);
  });
});
