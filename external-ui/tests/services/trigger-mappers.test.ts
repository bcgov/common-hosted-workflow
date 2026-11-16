import { describe, expect, it } from 'vitest';

import { apiItemToTrigger, payloadToCreateBody, payloadToUpdateBody } from '../../src/services/backend/trigger-mappers';
import type { ApiTriggerItem, ChefsFormTriggerPayload } from '../../src/services/backend/trigger-types';

const base: ChefsFormTriggerPayload = {
  type: 'chefs-form',
  n8nCredentialId: 'cred-1',
  formId: 'form-123',
  formName: 'Intake',
  baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
  apiKey: 'should-not-send', // pragma: allowlist secret
  allowedActors: '*',
  allowedActorsType: 'all',
  targetKind: 'n8n-node',
  targetWorkflowId: 'wf1',
  targetNodeId: 'node1',
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

describe('CHEFS skipChefsSubmission mapping', () => {
  const apiItem = (metadata: Record<string, unknown>): ApiTriggerItem => ({
    id: 't1',
    projectId: 'p1',
    triggerType: 'chefs-form',
    targetKind: 'n8n-node',
    targetWorkflowId: 'wf1',
    targetNodeId: 'node1',
    targetStatus: 'live',
    metadata,
    allowedActorsType: 'all',
    allowedActors: ['*'],
    authEnabled: false,
    createdAt: '',
    updatedAt: '',
    createdBy: null,
    updatedBy: null,
  });

  it('writes skipChefsSubmission true and defaults to false', () => {
    const on = payloadToCreateBody({ ...base, skipChefsSubmission: true }, 'user@example.com');
    const off = payloadToCreateBody(base, 'user@example.com');
    const updated = payloadToUpdateBody({ ...base, skipChefsSubmission: true }, 'user@example.com');

    expect(on.metadata).toMatchObject({ skipChefsSubmission: true });
    expect(off.metadata).toMatchObject({ skipChefsSubmission: false });
    expect(updated.metadata).toMatchObject({ skipChefsSubmission: true });
  });

  it('reads skipChefsSubmission from metadata, defaulting to false', () => {
    const on = apiItemToTrigger(apiItem({ formId: 'f', skipChefsSubmission: true }), 'tenant-1');
    const off = apiItemToTrigger(apiItem({ formId: 'f' }), 'tenant-1');
    const junk = apiItemToTrigger(apiItem({ formId: 'f', skipChefsSubmission: 'yes' }), 'tenant-1');

    expect(on.config.type).toBe('chefs-form');
    expect(on.config).toMatchObject({ skipChefsSubmission: true });
    expect(off.config).toMatchObject({ skipChefsSubmission: false });
    expect(junk.config).toMatchObject({ skipChefsSubmission: false });
  });
});

describe('n8n-node target mappers', () => {
  it('sends workflow and node ids as the target', () => {
    const body = payloadToCreateBody(base, 'user@example.com');
    expect(body).toMatchObject({ targetKind: 'n8n-node', targetWorkflowId: 'wf1', targetNodeId: 'node1' });
    expect(body).not.toHaveProperty('triggerUrl');
    expect(body).not.toHaveProperty('triggerMethod');
  });

  it('sends button inputValues for node targets', () => {
    const body = payloadToUpdateBody(
      {
        type: 'button',
        buttonText: 'Go',
        allowedActors: '*',
        allowedActorsType: 'all',
        targetKind: 'n8n-node',
        targetWorkflowId: 'wf1',
        targetNodeId: 'node1',
        inputValues: { amount: 5 },
      },
      'user@example.com',
    );
    expect(body.metadata).toMatchObject({ buttonText: 'Go', inputValues: { amount: 5 } });
  });
});

describe('apiItemToTrigger with node targets', () => {
  it('maps target fields and status', () => {
    const trigger = apiItemToTrigger(
      {
        id: 't1',
        projectId: 'p1',
        triggerType: 'button',
        targetKind: 'n8n-node',
        targetWorkflowId: 'wf1',
        targetNodeId: 'node1',
        targetStatus: 'unpublished',
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
      inputValues: { a: 1 },
    });
  });
});
