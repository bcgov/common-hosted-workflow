import { describe, expect, it } from 'vitest';
import { BcGovSharePointOAuth2Api } from '../../credentials/BcGovSharePointOAuth2Api.credentials';

describe('BcGovSharePointOAuth2Api credential', () => {
  const credential = new BcGovSharePointOAuth2Api();

  it('has the expected name and extends oAuth2Api', () => {
    expect(credential.name).toBe('bcGovSharePointOAuth2Api');
    expect(credential.extends).toEqual(['oAuth2Api']);
  });

  it('exposes the required visible fields from the spec', () => {
    const names = credential.properties.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'tenantId',
        'clientId',
        'clientSecret',
        'graphBaseUrl',
        'defaultSiteUrl',
        'cacheTtlMinutes',
        'maxRetries',
      ]),
    );
  });

  it('forces the client-credentials flow via hidden fields', () => {
    const grantType = credential.properties.find((p) => p.name === 'grantType');
    const scope = credential.properties.find((p) => p.name === 'scope');
    expect(grantType?.type).toBe('hidden');
    expect(grantType?.default).toBe('clientCredentials');
    expect(scope?.default).toBe('https://graph.microsoft.com/.default');
  });

  it('does not test against /sites/root', () => {
    const testUrl = credential.test.request.url as string;
    expect(testUrl).not.toContain('/sites/root');
    expect(testUrl).toContain('/sites/');
  });
});
