import { describe, expect, it } from 'vitest';
import { getSecureCookieFlag, getCookieOptions, getAuthCookieOptions } from '../../../src/api/helpers/cookie';

describe('getSecureCookieFlag', () => {
  it('returns true when base URL is https', () => {
    expect(getSecureCookieFlag({ baseUrl: 'https://n8n.example.com', protocol: '', isProduction: false })).toBe(true);
  });

  it('returns false when base URL is http', () => {
    expect(getSecureCookieFlag({ baseUrl: 'http://localhost:5678', protocol: '', isProduction: false })).toBe(false);
  });

  it('falls back to protocol when base is empty', () => {
    expect(getSecureCookieFlag({ baseUrl: '', protocol: 'https', isProduction: false })).toBe(true);
    expect(getSecureCookieFlag({ baseUrl: '', protocol: 'http', isProduction: false })).toBe(false);
  });

  it('prefers base URL over protocol when both present', () => {
    expect(getSecureCookieFlag({ baseUrl: 'https://n8n.example.com', protocol: 'http', isProduction: false })).toBe(
      true,
    );
    expect(getSecureCookieFlag({ baseUrl: 'http://n8n.example.com', protocol: 'https', isProduction: false })).toBe(
      false,
    );
  });

  it('throws in production when https base but protocol is http', () => {
    expect(() =>
      getSecureCookieFlag({ baseUrl: 'https://n8n.example.com', protocol: 'http', isProduction: true }),
    ).toThrow(/Inconsistent cookie security/);
  });

  it('throws in production when https base but protocol missing', () => {
    expect(() => getSecureCookieFlag({ baseUrl: 'https://n8n.example.com', protocol: '', isProduction: true })).toThrow(
      /Inconsistent cookie security/,
    );
  });

  it('throws in production when http base but protocol is https', () => {
    expect(() =>
      getSecureCookieFlag({ baseUrl: 'http://n8n.example.com', protocol: 'https', isProduction: true }),
    ).toThrow(/Inconsistent cookie security/);
  });

  it('throws in production when base invalid/missing and protocol not https', () => {
    expect(() => getSecureCookieFlag({ baseUrl: '', protocol: '', isProduction: true })).toThrow(/Missing or invalid/);
    expect(() => getSecureCookieFlag({ baseUrl: 'not-a-url', protocol: 'http', isProduction: true })).toThrow(
      /Missing or invalid/,
    );
  });

  it('does not throw in production when https base and https protocol', () => {
    expect(getSecureCookieFlag({ baseUrl: 'https://n8n.example.com', protocol: 'https', isProduction: true })).toBe(
      true,
    );
  });

  it('does not throw in production when http base and http protocol', () => {
    expect(getSecureCookieFlag({ baseUrl: 'http://n8n.example.com', protocol: 'http', isProduction: true })).toBe(
      false,
    );
  });

  it('allows missing base when protocol is https in production', () => {
    expect(getSecureCookieFlag({ baseUrl: '', protocol: 'https', isProduction: true })).toBe(true);
  });
});

describe('cookie options', () => {
  it('getCookieOptions returns Secure, HttpOnly, SameSite Lax, path /, 15m', () => {
    const opts = getCookieOptions(true);
    expect(opts).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 15 * 60 * 1000 });
    const insecure = getCookieOptions(false);
    expect(insecure.secure).toBe(false);
    expect(insecure.path).toBe('/');
  });

  it('getAuthCookieOptions returns Secure, HttpOnly, SameSite Lax, path /, 24h', () => {
    const opts = getAuthCookieOptions(true);
    expect(opts).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 24 * 60 * 60 * 1000 });
    const insecure = getAuthCookieOptions(false);
    expect(insecure.secure).toBe(false);
    expect(insecure.path).toBe('/');
  });
});
