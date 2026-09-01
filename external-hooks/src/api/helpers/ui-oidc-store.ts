import { createHash } from 'crypto';
import { createClient } from 'redis';
import { UI_OIDC_REDIS_URL, UI_OIDC_REDIS_PASSWORD, UI_OIDC_REDIS_PREFIX } from '@config';

type UiSessionExchangeRecord = {
  token: string;
};

export type UiLogoutHandleRecord = {
  email: string;
  returnTo: string;
};

type RedisClient = Awaited<ReturnType<typeof createClient>>;
type AccessTokenRecord = { email: string; expiresAt?: number };
export type RefreshTokenRecord = { token: string; expiresAt?: number };

export type TenantRole = {
  tenantId: string;
  tenantName: string;
  roles: string[];
};

export type TenantGroup = {
  tenantId: string;
  tenantName: string;
  groups: string[];
};

const REFRESH_TOKEN_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ID_TOKEN_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TENANT_ROLES_DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const TENANT_GROUPS_DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

function extractJwtExpiryMs(token: string): number | undefined {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return undefined;

    let base64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

let redisClientPromise: Promise<RedisClient> | null = null;

function getSessionExchangeKey(sessionHandle: string) {
  return `${UI_OIDC_REDIS_PREFIX}session:${sessionHandle}`;
}

/**
 * Normalize an identity email before it is used as (part of) a Redis key so
 * every caller reads and deletes the same records regardless of case or
 * surrounding whitespace.
 */
export function normalizeUiIdentityEmail(email: string) {
  return email.trim().toLowerCase();
}

function getRefreshTokenKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}reftoken:${normalizeUiIdentityEmail(email)}`;
}

function getIdTokenKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}idtoken:${normalizeUiIdentityEmail(email)}`;
}

function getAccessTokenByEmailKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}acctoken:${normalizeUiIdentityEmail(email)}`;
}

function getAccessTokenRecordKey(token: string) {
  const digest = createHash('sha256').update(token).digest('hex');
  return `${UI_OIDC_REDIS_PREFIX}tokenemail:${digest}`;
}

function getTenantRolesKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}tenantroles:${normalizeUiIdentityEmail(email)}`;
}

function getTenantGroupsKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}tenantgroups:${normalizeUiIdentityEmail(email)}`;
}

function getSessionIssueIdKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}sessionissue:${normalizeUiIdentityEmail(email)}`;
}

function getLogoutHandleKey(handle: string) {
  return `${UI_OIDC_REDIS_PREFIX}logout:${handle}`;
}

async function getRedisClient(): Promise<RedisClient> {
  if (!redisClientPromise) {
    const client = createClient({
      url: UI_OIDC_REDIS_URL,
      ...(UI_OIDC_REDIS_PASSWORD ? { password: UI_OIDC_REDIS_PASSWORD } : {}),
    });
    client.on('error', () => {});
    redisClientPromise = client.connect().then(() => client) as Promise<RedisClient>;
  }

  return redisClientPromise;
}

export async function setUiSessionExchange(sessionHandle: string, token: string, ttlMs: number) {
  const client = await getRedisClient();
  await client.set(getSessionExchangeKey(sessionHandle), JSON.stringify({ token } satisfies UiSessionExchangeRecord), {
    PX: ttlMs,
  });
}

export async function consumeUiSessionExchange(sessionHandle: string) {
  const client = await getRedisClient();
  const raw = await client.getDel(getSessionExchangeKey(sessionHandle));
  if (!raw) return null;
  return JSON.parse(raw) as UiSessionExchangeRecord;
}

export async function setUiLogoutHandle(handle: string, record: UiLogoutHandleRecord, ttlMs: number) {
  const client = await getRedisClient();
  const normalized: UiLogoutHandleRecord = { ...record, email: normalizeUiIdentityEmail(record.email) };
  await client.set(getLogoutHandleKey(handle), JSON.stringify(normalized), { PX: ttlMs });
}

/** Atomically read-and-delete a logout handle so it can only be used once. */
export async function consumeUiLogoutHandle(handle: string): Promise<UiLogoutHandleRecord | null> {
  const client = await getRedisClient();
  const raw = await client.getDel(getLogoutHandleKey(handle));
  if (!raw) return null;
  return JSON.parse(raw) as UiLogoutHandleRecord;
}

/**
 * Store the per-session issue identifier for an email. In separate-JWT mode
 * the identifier is embedded in the issued UI token and `getUiSession()`
 * rejects tokens whose identifier no longer matches the stored value, which
 * makes UI sessions server-revocable at logout.
 */
export async function setUiSessionIssueId(email: string, sessionId: string, ttlMs?: number) {
  const client = await getRedisClient();
  const effectiveTtl = ttlMs ?? REFRESH_TOKEN_MAX_TTL_MS;
  await client.set(getSessionIssueIdKey(email), sessionId, { PX: effectiveTtl });
}

export async function getUiSessionIssueId(email: string): Promise<string | null> {
  const client = await getRedisClient();
  return await client.get(getSessionIssueIdKey(email));
}

export async function setUiOidcRefreshToken(email: string, refreshToken: string, ttlMs?: number) {
  const client = await getRedisClient();
  const requestedTtl = ttlMs ?? REFRESH_TOKEN_MAX_TTL_MS;
  const effectiveTtl = Math.min(Math.max(requestedTtl, 1), REFRESH_TOKEN_MAX_TTL_MS);
  await client.set(getRefreshTokenKey(email), refreshToken, { PX: effectiveTtl });
}

export async function setUiOidcRefreshTokenWithExpiry(
  email: string,
  refreshToken: string,
  expiresAt?: number,
  ttlMs?: number,
) {
  const client = await getRedisClient();
  let effectiveTtl: number;
  if (typeof expiresAt === 'number') {
    const remainingMs = expiresAt - Date.now();
    const cappedRemaining = Math.min(remainingMs, REFRESH_TOKEN_MAX_TTL_MS);
    // Remaining validity may be negative if already expired — expire quickly
    const safeRemaining = Math.max(cappedRemaining, 1);
    const requested = ttlMs ?? safeRemaining;
    effectiveTtl = Math.min(requested, safeRemaining, REFRESH_TOKEN_MAX_TTL_MS);
  } else {
    const requested = ttlMs ?? REFRESH_TOKEN_MAX_TTL_MS;
    effectiveTtl = Math.min(Math.max(requested, 1), REFRESH_TOKEN_MAX_TTL_MS);
  }
  const record: RefreshTokenRecord = { token: refreshToken, expiresAt };
  await client.set(getRefreshTokenKey(email), JSON.stringify(record), { PX: effectiveTtl });
}

export async function getUiOidcRefreshTokenRecord(email: string): Promise<RefreshTokenRecord | null> {
  const client = await getRedisClient();
  const raw = await client.get(getRefreshTokenKey(email));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') {
      return { token: parsed };
    }
    return parsed as RefreshTokenRecord;
  } catch {
    return { token: raw };
  }
}

export async function getUiOidcRefreshToken(email: string) {
  const record = await getUiOidcRefreshTokenRecord(email);
  return record?.token ?? null;
}

export async function isRefreshTokenExpiredByEmail(email: string): Promise<boolean> {
  const record = await getUiOidcRefreshTokenRecord(email);
  if (!record) return true;
  if (!record.expiresAt) return false;
  return Date.now() > record.expiresAt;
}

export async function setUiOidcIdToken(email: string, idToken: string, ttlMs?: number) {
  const client = await getRedisClient();
  const tokenExpiryMs = extractJwtExpiryMs(idToken);
  const now = Date.now();
  const effectiveTtl = ttlMs ?? (tokenExpiryMs ? Math.max(tokenExpiryMs - now, 60_000) : ID_TOKEN_DEFAULT_TTL_MS);
  await client.set(getIdTokenKey(email), idToken, { PX: effectiveTtl });
}

export async function getUiOidcIdToken(email: string) {
  const client = await getRedisClient();
  return await client.get(getIdTokenKey(email));
}

export async function setUiOidcAccessTokenRecord(email: string, accessToken: string, expiresAt?: number) {
  const client = await getRedisClient();
  const previousToken = await client.get(getAccessTokenByEmailKey(email));
  if (previousToken) {
    await client.del(getAccessTokenRecordKey(previousToken));
  }

  await client.set(getAccessTokenByEmailKey(email), accessToken);

  const ttlMs = expiresAt ? Math.max(expiresAt - Date.now() + 5 * 60 * 1000, 5 * 60 * 1000) : undefined;
  const payload = JSON.stringify({ email, expiresAt } satisfies AccessTokenRecord);
  if (ttlMs) {
    await client.set(getAccessTokenRecordKey(accessToken), payload, { PX: ttlMs });
    return;
  }

  await client.set(getAccessTokenRecordKey(accessToken), payload);
}

export async function getUiOidcAccessTokenRecord(accessToken: string) {
  const client = await getRedisClient();
  const raw = await client.get(getAccessTokenRecordKey(accessToken));
  if (!raw) return null;
  return JSON.parse(raw) as AccessTokenRecord;
}

export async function deleteUiOidcTokens(email: string) {
  const client = await getRedisClient();
  const currentAccessToken = await client.get(getAccessTokenByEmailKey(email));
  const keys = [
    getRefreshTokenKey(email),
    getIdTokenKey(email),
    getAccessTokenByEmailKey(email),
    getSessionIssueIdKey(email),
    getTenantRolesKey(email),
    getTenantGroupsKey(email),
  ];

  if (currentAccessToken) {
    keys.push(getAccessTokenRecordKey(currentAccessToken));
  }

  await client.del(keys);
}

export async function setUiTenantRoles(email: string, roles: TenantRole[], ttlMs?: number) {
  const client = await getRedisClient();
  const effectiveTtl = ttlMs ?? TENANT_ROLES_DEFAULT_TTL_MS;
  await client.set(getTenantRolesKey(email), JSON.stringify(roles), { PX: effectiveTtl });
}

export async function getUiTenantRoles(email: string): Promise<TenantRole[] | null> {
  const client = await getRedisClient();
  const raw = await client.get(getTenantRolesKey(email));
  if (!raw) return null;
  return JSON.parse(raw) as TenantRole[];
}

export async function deleteUiTenantRoles(email: string) {
  const client = await getRedisClient();
  await client.del(getTenantRolesKey(email));
}

export async function setUiTenantGroups(email: string, groups: TenantGroup[], ttlMs?: number) {
  const client = await getRedisClient();
  const effectiveTtl = ttlMs ?? TENANT_GROUPS_DEFAULT_TTL_MS;
  await client.set(getTenantGroupsKey(email), JSON.stringify(groups), { PX: effectiveTtl });
}

export async function getUiTenantGroups(email: string): Promise<TenantGroup[] | null> {
  const client = await getRedisClient();
  const raw = await client.get(getTenantGroupsKey(email));
  if (!raw) return null;
  return JSON.parse(raw) as TenantGroup[];
}

export async function deleteUiTenantGroups(email: string) {
  const client = await getRedisClient();
  await client.del(getTenantGroupsKey(email));
}

export async function getUiOidcAccessTokenByEmail(email: string): Promise<string | null> {
  const client = await getRedisClient();
  return await client.get(getAccessTokenByEmailKey(email));
}
