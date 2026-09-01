import { describe, expect, it } from 'vitest';
import { resolveReturnTarget, type ReturnTargetPolicy } from '../../../src/api/helpers/return-target';

const policy: ReturnTargetPolicy = {
  trustedBase: 'https://n8n.example.com',
  allowedOrigins: ['https://n8n.example.com', 'https://ui.example.com'],
  pathPrefixes: {
    login: ['/ui'],
    logout: ['/ui'],
    continuation: ['/'],
  },
  fallback: 'https://ui.example.com/',
};

describe('resolveReturnTarget', () => {
  describe('absent candidates', () => {
    it.each([undefined, null, ''])('returns undefined for %j', (candidate) => {
      expect(resolveReturnTarget(candidate, 'login', policy)).toBeUndefined();
    });

    it('returns the fallback for non-string candidates', () => {
      expect(resolveReturnTarget(42, 'login', policy)).toBe(policy.fallback);
    });
  });

  describe('negative cases fall back to the safe destination', () => {
    const rejected: Array<[string, unknown]> = [
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

    it.each(rejected)('rejects %s', (_label, candidate) => {
      expect(resolveReturnTarget(candidate, 'login', policy)).toBe(policy.fallback);
    });

    it('rejects a valid login path for a purpose with a narrower prefix policy', () => {
      const narrowPolicy: ReturnTargetPolicy = {
        ...policy,
        pathPrefixes: { login: ['/ui/app'], logout: ['/ui'], continuation: ['/'] },
      };
      expect(resolveReturnTarget('/ui/other', 'login', narrowPolicy)).toBe(narrowPolicy.fallback);
      expect(resolveReturnTarget('/ui/other', 'logout', narrowPolicy)).toBe('/ui/other');
    });
  });

  describe('positive cases', () => {
    it('keeps a valid relative path with query and fragment', () => {
      expect(resolveReturnTarget('/ui/projects?filter=active#list', 'login', policy)).toBe(
        '/ui/projects?filter=active#list',
      );
    });

    it('keeps an absolute URL on a configured origin', () => {
      expect(resolveReturnTarget('https://ui.example.com/ui/settings?tab=1#top', 'login', policy)).toBe(
        'https://ui.example.com/ui/settings?tab=1#top',
      );
    });

    it('accepts the exact prefix boundary', () => {
      expect(resolveReturnTarget('/ui', 'login', policy)).toBe('/ui');
    });

    it('canonicalizes dot segments before applying the path policy', () => {
      expect(resolveReturnTarget('/ui/../ui/projects', 'login', policy)).toBe('/ui/projects');
    });

    it('resolves relative candidates against the trusted base, not a hostile base', () => {
      expect(resolveReturnTarget('projects', 'login', policy)).toBe(policy.fallback);
    });
  });
});
