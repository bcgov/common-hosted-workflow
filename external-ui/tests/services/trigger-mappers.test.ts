import { describe, expect, it } from 'vitest';

import { apiItemToTrigger, payloadToCreateBody, payloadToUpdateBody } from '../../src/services/backend/trigger-mappers';
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

describe('n8n-node target mappers', () => {
  const nodeChefs: ChefsFormTriggerPayload = {
    ...base,
    callbackWebhookUrl: '',
    targetKind: 'n8n-node',
    targetWorkflowId: 'wf1',
    targetNodeId: 'node1',
  };

  it('sends workflow and node ids instead of url fields, and no postBody', () => {
    const body = payloadToCreateBody(nodeChefs, 'user@example.com');
    expect(body).toMatchObject({ targetKind: 'n8n-node', targetWorkflowId: 'wf1', targetNodeId: 'node1' });
    expect(body).not.toHaveProperty('triggerUrl');
    expect(body).not.toHaveProperty('triggerMethod');
    expect(body.metadata).not.toHaveProperty('postBody');
  });

  it('sends button inputValues for node targets', () => {
    const body = payloadToUpdateBody(
      {
        type: 'button',
        buttonText: 'Go',
        webhookUrl: '',
        postBody: '',
        allowedActors: '*',
        allowedActorsType: 'all',
        triggerMethod: 'POST',
        includeActorId: true,
        targetKind: 'n8n-node',
        targetWorkflowId: 'wf1',
        targetNodeId: 'node1',
        inputValues: { amount: 5 },
      },
      'user@example.com',
    );
    expect(body.metadata).toMatchObject({ buttonText: 'Go', inputValues: { amount: 5 } });
    expect(body.metadata).not.toHaveProperty('postBody');
  });

  it('keeps legacy URL bodies unchanged', () => {
    const body = payloadToCreateBody(base, 'user@example.com');
    expect(body).toMatchObject({ triggerUrl: 'https://example.com/hook', triggerMethod: 'POST' });
    expect(body).not.toHaveProperty('targetKind');
  });
});

describe('apiItemToTrigger with node targets', () => {
  it('maps target fields, null url and status', () => {
    const trigger = apiItemToTrigger(
      {
        id: 't1',
        projectId: 'p1',
        triggerType: 'button',
        targetKind: 'n8n-node',
        targetWorkflowId: 'wf1',
        targetNodeId: 'node1',
        targetStatus: 'unpublished',
        triggerUrl: null,
        triggerMethod: null,
        metadata: { buttonText: 'Go', inputValues: { a: 1 } },
        allowedActorsType: 'all',
        allowedActors: ['*'],
        authEnabled: false,
        createdAt: '',
        updatedAt: '',
        createdBy: null,
        updatedBy: null,
      },
      'tenant',
    );
    expect(trigger.targetStatus).toBe('unpublished');
    expect(trigger.config).toMatchObject({
      targetKind: 'n8n-node',
      targetWorkflowId: 'wf1',
      webhookUrl: '',
      inputValues: { a: 1 },
    });
  });
});
