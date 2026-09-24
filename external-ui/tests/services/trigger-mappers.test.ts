import { describe, expect, it } from 'vitest';

import { payloadToCreateBody, payloadToUpdateBody } from '../../src/services/backend/trigger-mappers';
import type { ChefsFormTriggerPayload } from '../../src/services/backend/trigger-types';

const base: ChefsFormTriggerPayload = {
  type: 'chefs-form',
  n8nCredentialId: 'cred-1',
  formId: 'form-123',
  formName: 'Intake',
  baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
  apiKey: 'should-not-send', // pragma: allowlist secret
  allowedActors: '*',
  allowedActorsType: 'all',
  callbackWebhookUrl: 'https://example.com/hook',
  postBody: '',
  triggerMethod: 'POST',
  includeActorId: true,
};

describe('CHEFS trigger mappers', () => {
  it('omits the API key when an n8n credential is selected', () => {
    const created = payloadToCreateBody(base, 'user@example.com');
    const updated = payloadToUpdateBody(base, 'user@example.com');

    expect(created.metadata).toMatchObject({ n8nCredentialId: 'cred-1', formId: 'form-123' });
    expect(created.metadata).not.toHaveProperty('apiKey');
    expect(updated.metadata).not.toHaveProperty('apiKey');
  });

  it('sends the legacy API key when no n8n credential is selected', () => {
    const created = payloadToCreateBody({ ...base, n8nCredentialId: '', apiKey: 'legacy-key' }, 'user@example.com'); // pragma: allowlist secret

    expect(created.metadata).toMatchObject({ n8nCredentialId: '', apiKey: 'legacy-key' }); // pragma: allowlist secret
  });
});
