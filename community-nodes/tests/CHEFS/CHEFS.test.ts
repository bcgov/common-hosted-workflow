import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ChefsApi } from '../../credentials/ChefsApi.credentials';
import { includeAuthorizationHeader } from '../../nodes/CHEFS/shared/requestOptions';
import { apiKey, createHarness, description, formID, localToken, operations, submissionID } from './helpers';

describe.each(operations)('CHEFS $resource / $operation', ({ resource, operation, path, needsSubmission }) => {
  it('shows and requires only the operation inputs', () => {
    const { visible } = createHarness({ resource, operation });
    for (const name of ['formID', 'authorizationToken']) {
      expect(visible(name)).toHaveLength(1);
      expect(visible(name)[0].required).toBe(true);
    }
    expect(visible('submissionID')).toHaveLength(needsSubmission ? 1 : 0);
    if (needsSubmission) expect(visible('submissionID')[0].required).toBe(true);
    expect(visible('operation')).toHaveLength(1);
    expect(visible('operation')[0].noDataExpression).toBe(true);
  });

  it('sends the declared GET path and JSON/Basic headers', async () => {
    const { send, getCredentials, httpRequest } = createHarness({ resource, operation });
    const request = await send();
    expect(request).toEqual({
      baseURL: 'https://submit.digital.gov.bc.ca/app/api/v1',
      method: 'GET',
      url: path,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        authorization: `Basic ${Buffer.from(`${formID}:${apiKey}`).toString('base64')}`,
      },
    });
    expect(getCredentials).toHaveBeenCalledExactlyOnceWith('chefsApi');
    expect(httpRequest).toHaveBeenCalledExactlyOnceWith(request);
    expect(JSON.stringify(request)).not.toContain(localToken);
  });

  for (const field of needsSubmission ? ['formID', 'submissionID'] : ['formID']) {
    it.each([undefined, null, '', ' \t ', 123, false, {}, []])(
      `rejects invalid ${field} (%j) in pre-send`,
      async (value) => {
        const { context } = createHarness({ resource, operation, [field]: value });
        const headers = Object.freeze({ Accept: 'application/json', authorization: 'existing' });
        const request = { url: path, headers };
        await expect(includeAuthorizationHeader.call(context, request)).rejects.toThrow(
          `(${field}) must be a nonblank string`,
        );
        expect(request).toEqual({ url: path, headers });
        expect(request.headers.authorization).toBe('existing');
      },
    );
  }

  it.each([undefined, null, '', ' \t ', 123, false, {}, []])(
    'rejects an invalid identifier expression (%j) before transport',
    async (id) => {
      const field = needsSubmission ? 'submissionID' : 'formID';
      const { send, httpRequest } = createHarness({ resource, operation, [field]: '={{ $json.id }}' }, {}, { id });
      await expect(send()).rejects.toThrow(`(${field}) must be a nonblank string`);
      expect(httpRequest).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, '', ' \t ', 123, false, {}, []])(
    'rejects an invalid token expression (%j) before transport',
    async (token) => {
      const { send, httpRequest } = createHarness(
        { resource, operation, authorizationToken: '={{ $json.token }}' },
        {},
        { token },
      );
      await expect(send()).rejects.toThrow('Node Authorization Token must be a nonblank string');
      expect(httpRequest).not.toHaveBeenCalled();
    },
  );

  it('rejects missing API keys before transport', async () => {
    const { send, httpRequest } = createHarness({ resource, operation }, { apiKey: undefined });
    await expect(send()).rejects.toThrow('Credential API Key must be a nonblank string');
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it('uses current-item expressions for route, local token and Basic username', async () => {
    const parameters = {
      resource,
      operation,
      formID: '={{ $json.form }}',
      submissionID: '={{ $json.submission }}',
      authorizationToken: '={{ $json.token }}',
    };
    for (const suffix of ['1', '2']) {
      const form = `${formID}-${suffix}`;
      const submission = `${submissionID}-${suffix}`;
      const harness = createHarness(parameters, {}, { form, submission, token: localToken });
      const request = await harness.send();
      expect(request.url).toBe(path.replace(formID, form).replace(submissionID, submission));
      expect(request.headers?.authorization).toBe(`Basic ${Buffer.from(`${form}:${apiKey}`).toString('base64')}`);
    }
  });

  it('stops a mismatched local token before transport', async () => {
    const { send, httpRequest } = createHarness({ resource, operation, authorizationToken: 'wrong-SECRET' });
    await expect(send()).rejects.toThrow('Token mismatch');
    expect(httpRequest).not.toHaveBeenCalled();
  });
});

describe('CHEFS compatibility and form-only operation', () => {
  it.each([undefined, '', null, 123])('gets form statuses without reading Submission ID (%j)', async (submission) => {
    const { send, getNodeParameter } = createHarness({
      resource: 'status',
      operation: 'getFormStatuses',
      submissionID: submission,
    });
    expect((await send()).url).toBe(`/forms/${formID}/statusCodes`);
    expect(getNodeParameter.mock.calls.some(([name]) => name === 'submissionID')).toBe(false);
  });

  it.each([
    { resource: 'submission', operation: 'getFormStatuses' },
    { resource: 'status', operation: 'get' },
    { resource: 'status', operation: 'getSubmissionStatuses' },
    { resource: undefined, operation: undefined },
  ])('rejects unsupported selections without adding headers (%j)', async (selection) => {
    const { context } = createHarness(selection);
    const request = { url: '/test' };
    await expect(includeAuthorizationHeader.call(context, request)).rejects.toThrow(
      'Unsupported CHEFS resource/operation selection',
    );
    expect(request).toEqual({ url: '/test' });
  });

  it('models missing parameters and expression results without permissive coercion', () => {
    const { getNodeParameter } = createHarness({ authorizationToken: '={{ $json.missing }}' });
    expect(() => getNodeParameter('missing')).toThrow('Could not get parameter');
    expect(getNodeParameter('missing', '')).toBe('');
    expect(getNodeParameter('authorizationToken', '')).toBeUndefined();
  });

  it('retains serialized node, operation, property and credential identifiers', () => {
    expect(description.name).toBe('chefs');
    expect(description.version).toBe(1);
    expect(description.credentials).toEqual([{ name: 'chefsApi', required: true }]);
    expect(description.properties.map(({ name }) => name)).toEqual([
      'resource',
      'operation',
      'operation',
      'formID',
      'authorizationToken',
      'submissionID',
    ]);
    const credential = new ChefsApi();
    expect(credential.name).toBe('chefsApi');
    expect(credential.properties.map(({ name }) => name)).toEqual(['authorizationToken', 'apiKey']);
    expect(credential.properties.every((property) => property.required && property.typeOptions?.password)).toBe(true);
  });

  it('links metadata and credentials to the local canonical guides', () => {
    const metadata = JSON.parse(readFileSync(new URL('../../nodes/CHEFS/CHEFS.node.json', import.meta.url), 'utf8'));
    const base = 'https://bcgov.github.io/common-hosted-workflow/community-nodes/chefs';
    expect(metadata.node).toBe('n8n-nodes-chefs');
    expect(metadata.resources.primaryDocumentation).toEqual([{ url: base }]);
    expect(metadata.resources.credentialDocumentation).toEqual([{ url: `${base}/credentials` }]);
    expect(new ChefsApi().documentationUrl).toBe(`${base}/credentials`);
  });
});
