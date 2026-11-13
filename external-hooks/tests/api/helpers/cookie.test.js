'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const cookie_1 = require('../../../src/api/helpers/cookie');
(0, vitest_1.describe)('getSecureCookieFlag', () => {
  (0, vitest_1.it)('returns true when base URL is https', () => {
    (0, vitest_1.expect)(
      (0, cookie_1.getSecureCookieFlag)({ baseUrl: 'https://n8n.example.com', protocol: '', isProduction: false }),
    ).toBe(true);
  });
  (0, vitest_1.it)('returns false when base URL is http', () => {
    (0, vitest_1.expect)(
      (0, cookie_1.getSecureCookieFlag)({ baseUrl: 'http://localhost:5678', protocol: '', isProduction: false }),
    ).toBe(false);
  });
  (0, vitest_1.it)('falls back to protocol when base is empty', () => {
    (0, vitest_1.expect)(
      (0, cookie_1.getSecureCookieFlag)({ baseUrl: '', protocol: 'https', isProduction: false }),
    ).toBe(true);
    (0, vitest_1.expect)(
      (0, cookie_1.getSecureCookieFlag)({ baseUrl: '', protocol: 'http', isProduction: false }),
    ).toBe(false);
  });
  (0, vitest_1.it)('prefers base URL over protocol when both present', () => {
    (0, vitest_1.expect)(
      (0, cookie_1.getSecureCookieFlag)({ baseUrl: 'https://n8n.example.com', protocol: 'http', isProduction: false }),
    ).toBe(true);
    (0, vitest_1.expect)(
      (0, cookie_1.getSecureCookieFlag)({ baseUrl: 'http://n8n.example.com', protocol: 'https', isProduction: false }),
    ).toBe(false);
  });
  (0, vitest_1.it)('throws in production when https base but protocol is http', () => {
    (0, vitest_1.expect)(() =>
      (0, cookie_1.getSecureCookieFlag)({ baseUrl: 'https://n8n.example.com', protocol: 'http', isProduction: true }),
    ).toThrow(/Inconsistent cookie security/);
  });
  (0, vitest_1.it)('throws in production when https base but protocol missing', () => {
    (0, vitest_1.expect)(() =>
      (0, cookie_1.getSecureCookieFlag)({ baseUrl: 'https://n8n.example.com', protocol: '', isProduction: true }),
    ).toThrow(/Inconsistent cookie security/);
  });
  (0, vitest_1.it)('throws in production when http base but protocol is https', () => {
    (0, vitest_1.expect)(() =>
      (0, cookie_1.getSecureCookieFlag)({ baseUrl: 'http://n8n.example.com', protocol: 'https', isProduction: true }),
    ).toThrow(/Inconsistent cookie security/);
  });
  (0, vitest_1.it)('throws in production when base invalid/missing and protocol not https', () => {
    (0, vitest_1.expect)(() =>
      (0, cookie_1.getSecureCookieFlag)({ baseUrl: '', protocol: '', isProduction: true }),
    ).toThrow(/Missing or invalid/);
    (0, vitest_1.expect)(() =>
      (0, cookie_1.getSecureCookieFlag)({ baseUrl: 'not-a-url', protocol: 'http', isProduction: true }),
    ).toThrow(/Missing or invalid/);
  });
  (0, vitest_1.it)('does not throw in production when https base and https protocol', () => {
    (0, vitest_1.expect)(
      (0, cookie_1.getSecureCookieFlag)({ baseUrl: 'https://n8n.example.com', protocol: 'https', isProduction: true }),
    ).toBe(true);
  });
  (0, vitest_1.it)('does not throw in production when http base and http protocol', () => {
    (0, vitest_1.expect)(
      (0, cookie_1.getSecureCookieFlag)({ baseUrl: 'http://n8n.example.com', protocol: 'http', isProduction: true }),
    ).toBe(false);
  });
  (0, vitest_1.it)('allows missing base when protocol is https in production', () => {
    (0, vitest_1.expect)(
      (0, cookie_1.getSecureCookieFlag)({ baseUrl: '', protocol: 'https', isProduction: true }),
    ).toBe(true);
  });
});
(0, vitest_1.describe)('cookie options', () => {
  (0, vitest_1.it)('getCookieOptions returns Secure, HttpOnly, SameSite Lax, path /, 15m', () => {
    const opts = (0, cookie_1.getCookieOptions)(true);
    (0, vitest_1.expect)(opts).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000,
    });
    const insecure = (0, cookie_1.getCookieOptions)(false);
    (0, vitest_1.expect)(insecure.secure).toBe(false);
    (0, vitest_1.expect)(insecure.path).toBe('/');
  });
  (0, vitest_1.it)('getAuthCookieOptions returns Secure, HttpOnly, SameSite Lax, path /, 24h', () => {
    const opts = (0, cookie_1.getAuthCookieOptions)(true);
    (0, vitest_1.expect)(opts).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });
    const insecure = (0, cookie_1.getAuthCookieOptions)(false);
    (0, vitest_1.expect)(insecure.secure).toBe(false);
    (0, vitest_1.expect)(insecure.path).toBe('/');
  });
});
