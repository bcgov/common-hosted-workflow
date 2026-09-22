/**
 * Unit tests for `ChefsService.getFormToken` in `src/api/services/chefs.service.ts`.
 *
 * The token exchange derives the CHEFS gateway URL (where the token is fetched)
 * and the render base URL (returned to the external UI) from the credential's
 * own Base URL when one is provided — so each credential targets its own CHEFS
 * environment. When no credential Base URL is given (e.g. CHEFS form triggers),
 * it falls back to the env-derived `CHEFS_GATEWAY_URL` / `CHEFS_BASE_URL`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/config')>();
  return {
    ...original,
    CHEFS_BASE_URL: 'https://chefs-env.example.gov.bc.ca',
    CHEFS_GATEWAY_URL: 'https://chefs-env.example.gov.bc.ca/app/gateway/v1',
  };
});

vi.mock('axios', () => {
  const post = vi.fn();
  return {
    default: { post, isAxiosError: vi.fn().mockReturnValue(false) },
    isAxiosError: vi.fn().mockReturnValue(false),
  };
});

import axios from 'axios';
import { ChefsService } from '../../../src/api/services/chefs.service';

const postMock = axios.post as unknown as ReturnType<typeof vi.fn>;

function createService() {
  return new ChefsService({} as any, {} as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  postMock.mockResolvedValue({ data: { token: 'chefs-token' } });
});

describe('ChefsService.getFormToken', () => {
  it('derives the gateway and render base URLs from the credential Base URL origin', async () => {
    const service = createService();

    const result = await service.getFormToken({
      formId: 'form-123',
      formApiKey: 'key-abc', // pragma: allowlist secret
      credentialBaseUrl: 'https://chefs-dev.apps.silver.devops.gov.bc.ca/app/api/v1',
    });

    // Token fetched against the credential's origin, not the env value.
    expect(postMock).toHaveBeenCalledWith(
      'https://chefs-dev.apps.silver.devops.gov.bc.ca/app/gateway/v1/auth/token/forms/form-123',
      undefined,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }),
      }),
    );
    // Render base URL returned to the UI is the credential origin + /app.
    expect(result.baseUrl).toBe('https://chefs-dev.apps.silver.devops.gov.bc.ca/app');
    expect(result.authToken).toBe('chefs-token');
    expect(result.formId).toBe('form-123');
  });

  it('ignores any path/query on the credential Base URL and keeps only the origin', async () => {
    const service = createService();

    const result = await service.getFormToken({
      formId: 'form-9',
      formApiKey: 'key', // pragma: allowlist secret
      credentialBaseUrl: 'https://chefs-test.example.gov.bc.ca/some/deep/path?x=1',
    });

    expect(postMock).toHaveBeenCalledWith(
      'https://chefs-test.example.gov.bc.ca/app/gateway/v1/auth/token/forms/form-9',
      undefined,
      expect.anything(),
    );
    expect(result.baseUrl).toBe('https://chefs-test.example.gov.bc.ca/app');
  });

  it('falls back to the env-derived URLs when no credential Base URL is provided', async () => {
    const service = createService();

    const result = await service.getFormToken({
      formId: 'form-1',
      formApiKey: 'key', // pragma: allowlist secret
    });

    expect(postMock).toHaveBeenCalledWith(
      'https://chefs-env.example.gov.bc.ca/app/gateway/v1/auth/token/forms/form-1',
      undefined,
      expect.anything(),
    );
    expect(result.baseUrl).toBe('https://chefs-env.example.gov.bc.ca/app');
  });

  it('falls back to the env-derived URLs when the credential Base URL is not a valid absolute URL', async () => {
    const service = createService();

    const result = await service.getFormToken({
      formId: 'form-1',
      formApiKey: 'key', // pragma: allowlist secret
      credentialBaseUrl: 'not-a-url',
    });

    expect(postMock).toHaveBeenCalledWith(
      'https://chefs-env.example.gov.bc.ca/app/gateway/v1/auth/token/forms/form-1',
      undefined,
      expect.anything(),
    );
    expect(result.baseUrl).toBe('https://chefs-env.example.gov.bc.ca/app');
  });
});
