"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Unit tests for `ChefsService.getFormToken` in `src/api/services/chefs.service.ts`.
 *
 * The token exchange derives the CHEFS gateway URL (where the token is fetched)
 * and the render base URL (returned to the external UI) from the credential's
 * own Base URL when one is provided — so each credential targets its own CHEFS
 * environment. When no credential Base URL is given (e.g. CHEFS form triggers),
 * it falls back to the env-derived `CHEFS_GATEWAY_URL` / `CHEFS_BASE_URL`.
 */
const vitest_1 = require("vitest");
vitest_1.vi.mock('@config', async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        CHEFS_BASE_URL: 'https://chefs-env.example.gov.bc.ca',
        CHEFS_GATEWAY_URL: 'https://chefs-env.example.gov.bc.ca/app/gateway/v1',
        // Origins used by the "credential Base URL" tests below must be explicitly
        // allowlisted — a credential's Base URL is otherwise rejected in favour of
        // the configured CHEFS_BASE_URL origin (see chefs.service.ts resolveChefsUrls).
        CHEFS_ALLOWED_ORIGINS: ['https://chefs-dev.apps.silver.devops.gov.bc.ca', 'https://chefs-test.example.gov.bc.ca'],
    };
});
vitest_1.vi.mock('axios', () => {
    const post = vitest_1.vi.fn();
    return {
        default: { post, isAxiosError: vitest_1.vi.fn().mockReturnValue(false) },
        isAxiosError: vitest_1.vi.fn().mockReturnValue(false),
    };
});
const axios_1 = __importDefault(require("axios"));
const chefs_service_1 = require("../../../src/api/services/chefs.service");
const postMock = axios_1.default.post;
function createService() {
    return new chefs_service_1.ChefsService({}, {}, {});
}
(0, vitest_1.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    postMock.mockResolvedValue({ data: { token: 'chefs-token' } });
});
(0, vitest_1.describe)('ChefsService.getFormToken', () => {
    (0, vitest_1.it)('derives the gateway and render base URLs from the credential Base URL origin', async () => {
        const service = createService();
        const result = await service.getFormToken({
            formId: 'form-123',
            formApiKey: 'key-abc', // pragma: allowlist secret
            credentialBaseUrl: 'https://chefs-dev.apps.silver.devops.gov.bc.ca/app/api/v1',
        });
        // Token fetched against the credential's origin, not the env value.
        (0, vitest_1.expect)(postMock).toHaveBeenCalledWith('https://chefs-dev.apps.silver.devops.gov.bc.ca/app/gateway/v1/auth/token/forms/form-123', undefined, vitest_1.expect.objectContaining({
            headers: vitest_1.expect.objectContaining({ Authorization: vitest_1.expect.stringMatching(/^Basic /) }),
        }));
        // Render base URL returned to the UI is the credential origin + /app.
        (0, vitest_1.expect)(result.baseUrl).toBe('https://chefs-dev.apps.silver.devops.gov.bc.ca/app');
        (0, vitest_1.expect)(result.authToken).toBe('chefs-token');
        (0, vitest_1.expect)(result.formId).toBe('form-123');
    });
    (0, vitest_1.it)('ignores any path/query on the credential Base URL and keeps only the origin', async () => {
        const service = createService();
        const result = await service.getFormToken({
            formId: 'form-9',
            formApiKey: 'key', // pragma: allowlist secret
            credentialBaseUrl: 'https://chefs-test.example.gov.bc.ca/some/deep/path?x=1',
        });
        (0, vitest_1.expect)(postMock).toHaveBeenCalledWith('https://chefs-test.example.gov.bc.ca/app/gateway/v1/auth/token/forms/form-9', undefined, vitest_1.expect.anything());
        (0, vitest_1.expect)(result.baseUrl).toBe('https://chefs-test.example.gov.bc.ca/app');
    });
    (0, vitest_1.it)('falls back to the env-derived URLs when no credential Base URL is provided', async () => {
        const service = createService();
        const result = await service.getFormToken({
            formId: 'form-1',
            formApiKey: 'key', // pragma: allowlist secret
        });
        (0, vitest_1.expect)(postMock).toHaveBeenCalledWith('https://chefs-env.example.gov.bc.ca/app/gateway/v1/auth/token/forms/form-1', undefined, vitest_1.expect.anything());
        (0, vitest_1.expect)(result.baseUrl).toBe('https://chefs-env.example.gov.bc.ca/app');
    });
    (0, vitest_1.it)('falls back to the env-derived URLs when the credential Base URL is not a valid absolute URL', async () => {
        const service = createService();
        const result = await service.getFormToken({
            formId: 'form-1',
            formApiKey: 'key', // pragma: allowlist secret
            credentialBaseUrl: 'not-a-url',
        });
        (0, vitest_1.expect)(postMock).toHaveBeenCalledWith('https://chefs-env.example.gov.bc.ca/app/gateway/v1/auth/token/forms/form-1', undefined, vitest_1.expect.anything());
        (0, vitest_1.expect)(result.baseUrl).toBe('https://chefs-env.example.gov.bc.ca/app');
    });
    (0, vitest_1.it)('fails with a 502 and a message the user can act on when CHEFS cannot be reached', async () => {
        const service = createService();
        postMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
        await (0, vitest_1.expect)(service.getFormToken({ formId: 'form-1', formApiKey: 'key' })).rejects.toMatchObject({
            statusCode: 502,
            message: "Cannot connect to CHEFS with the selected CHEFS credential. Please check the credential's base URL, form ID and API key, then try again.",
        });
    });
    (0, vitest_1.it)('falls back to the env-derived URLs when the credential Base URL origin is not allowlisted', async () => {
        const service = createService();
        const result = await service.getFormToken({
            formId: 'form-1',
            formApiKey: 'key', // pragma: allowlist secret
            // Not the configured CHEFS_BASE_URL origin and not in CHEFS_ALLOWED_ORIGINS — an
            // attacker-controlled credential or legacy trigger metadata must not be able to
            // point the UI's script/render origin anywhere it likes.
            credentialBaseUrl: 'https://evil.example/app/api/v1',
        });
        (0, vitest_1.expect)(postMock).toHaveBeenCalledWith('https://chefs-env.example.gov.bc.ca/app/gateway/v1/auth/token/forms/form-1', undefined, vitest_1.expect.anything());
        (0, vitest_1.expect)(result.baseUrl).toBe('https://chefs-env.example.gov.bc.ca/app');
    });
});
