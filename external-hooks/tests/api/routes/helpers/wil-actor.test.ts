/**
 * Unit tests for `src/api/routes/helpers/wil-actor.ts`.
 */
import { describe, expect, it } from 'vitest';
import { resolveActorIds } from '../../../../src/api/routes/helpers/wil-actor';
import type { UiAuthenticatedSession } from '../../../../src/api/helpers/ui-oidc';

function makeSession(overrides: Partial<UiAuthenticatedSession> = {}): UiAuthenticatedSession {
  return {
    subject: 'sub-abc-123',
    email: 'user@example.com',
    preferredUsername: 'user',
    name: 'Test User',
    issuer: 'https://issuer.example.com',
    audience: ['app'],
    claims: {},
    n8nUser: { id: 'n8n-1', email: 'user@example.com', role: null },
    ...overrides,
  };
}

describe('resolveActorIds', () => {
  it('returns session email as primary actor id', () => {
    const session = makeSession({ email: 'alice@corp.io' });
    const result = resolveActorIds(session);

    expect(result.primary).toBe('alice@corp.io');
  });

  it('returns session subject as fallback actor id', () => {
    const session = makeSession({ subject: 'oidc-sub-xyz' });
    const result = resolveActorIds(session);

    expect(result.fallback).toBe('oidc-sub-xyz');
  });

  it('primary and fallback differ when email and subject differ', () => {
    const session = makeSession({ email: 'user@example.com', subject: 'sub-99' });
    const result = resolveActorIds(session);

    expect(result.primary).not.toBe(result.fallback);
    expect(result.primary).toBe('user@example.com');
    expect(result.fallback).toBe('sub-99');
  });

  it('primary and fallback are equal when email matches subject', () => {
    const session = makeSession({ email: 'same-value', subject: 'same-value' });
    const result = resolveActorIds(session);

    expect(result.primary).toBe(result.fallback);
  });
});
