"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const return_target_1 = require("../../../src/api/helpers/return-target");
const policy = {
    trustedBase: 'https://n8n.example.com',
    allowedOrigins: ['https://n8n.example.com', 'https://ui.example.com'],
    pathPrefixes: {
        login: ['/ui'],
        logout: ['/ui'],
        continuation: ['/'],
    },
    fallback: 'https://ui.example.com/',
};
(0, vitest_1.describe)('resolveReturnTarget', () => {
    (0, vitest_1.describe)('absent candidates', () => {
        vitest_1.it.each([undefined, null, ''])('returns undefined for %j', (candidate) => {
            (0, vitest_1.expect)((0, return_target_1.resolveReturnTarget)(candidate, 'login', policy)).toBeUndefined();
        });
        (0, vitest_1.it)('returns the fallback for non-string candidates', () => {
            (0, vitest_1.expect)((0, return_target_1.resolveReturnTarget)(42, 'login', policy)).toBe(policy.fallback);
        });
    });
    (0, vitest_1.describe)('negative cases fall back to the safe destination', () => {
        const rejected = [
            ['backslash network path', '/\\evil.test'],
            ['authority-relative', '//evil.test'],
            ['authority-relative with path', '//evil.test/ui'],
            ['encoded backslash', '/%5c%5cevil.test'],
            ['encoded forward-slash network path', '/%2f%2fevil.test'],
            ['non-http scheme', 'javascript:alert(1)'],
            ['foreign origin', 'https://evil.test/ui/projects'],
            ['foreign origin look-alike', 'https://n8n.example.com.evil.test/ui'],
            ['credentials on allowed origin', 'https://user:pass@n8n.example.com/ui'], // pragma: allowlist secret
            ['credentials on foreign origin', 'https://user@evil.test/ui'],
            ['disallowed same-origin path', '/workflows'],
            ['prefix without boundary', '/uiadmin'],
            ['encoded path escape', '/ui/%2e%2e/admin'],
            ['control character', '/ui/projects' + String.fromCharCode(31)],
            ['unparseable URL', 'https://'],
        ];
        vitest_1.it.each(rejected)('rejects %s', (_label, candidate) => {
            (0, vitest_1.expect)((0, return_target_1.resolveReturnTarget)(candidate, 'login', policy)).toBe(policy.fallback);
        });
        (0, vitest_1.it)('rejects a valid login path for a purpose with a narrower prefix policy', () => {
            const narrowPolicy = {
                ...policy,
                pathPrefixes: { login: ['/ui/app'], logout: ['/ui'], continuation: ['/'] },
            };
            (0, vitest_1.expect)((0, return_target_1.resolveReturnTarget)('/ui/other', 'login', narrowPolicy)).toBe(narrowPolicy.fallback);
            (0, vitest_1.expect)((0, return_target_1.resolveReturnTarget)('/ui/other', 'logout', narrowPolicy)).toBe('/ui/other');
        });
    });
    (0, vitest_1.describe)('positive cases', () => {
        (0, vitest_1.it)('keeps a valid relative path with query and fragment', () => {
            (0, vitest_1.expect)((0, return_target_1.resolveReturnTarget)('/ui/projects?filter=active#list', 'login', policy)).toBe('/ui/projects?filter=active#list');
        });
        (0, vitest_1.it)('keeps an absolute URL on a configured origin', () => {
            (0, vitest_1.expect)((0, return_target_1.resolveReturnTarget)('https://ui.example.com/ui/settings?tab=1#top', 'login', policy)).toBe('https://ui.example.com/ui/settings?tab=1#top');
        });
        (0, vitest_1.it)('accepts the exact prefix boundary', () => {
            (0, vitest_1.expect)((0, return_target_1.resolveReturnTarget)('/ui', 'login', policy)).toBe('/ui');
        });
        (0, vitest_1.it)('canonicalizes dot segments before applying the path policy', () => {
            (0, vitest_1.expect)((0, return_target_1.resolveReturnTarget)('/ui/../ui/projects', 'login', policy)).toBe('/ui/projects');
        });
        (0, vitest_1.it)('resolves relative candidates against the trusted base, not a hostile base', () => {
            (0, vitest_1.expect)((0, return_target_1.resolveReturnTarget)('projects', 'login', policy)).toBe(policy.fallback);
        });
    });
});
