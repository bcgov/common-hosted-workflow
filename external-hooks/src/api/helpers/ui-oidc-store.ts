import { createHash } from 'crypto';
import { createClient } from 'redis';
import { UI_OIDC_REDIS_URL, UI_OIDC_REDIS_PASSWORD, UI_OIDC_REDIS_PREFIX } from '@config';

type UiOidcStateRecord = {
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  redirectUri: string;
};

type UiSessionExchangeRecord = {
  token: string;
};

type RedisClient = Awaited<ReturnType<typeof createClient>>;
type AccessTokenRecord = { email: string; expiresAt?: number };

const REFRESH_TOKEN_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ID_TOKEN_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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

function getStateKey(state: string) {
  return `${UI_OIDC_REDIS_PREFIX}state:${state}`;
}

function getSessionExchangeKey(sessionHandle: string) {
  return `${UI_OIDC_REDIS_PREFIX}session:${sessionHandle}`;
}

function getRefreshTokenKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}reftoken:${email}`;
}

function getIdTokenKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}idtoken:${email}`;
}

function getAccessTokenByEmailKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}acctoken:${email}`;
}

function getAccessTokenRecordKey(token: string) {
  const digest = createHash('sha256').update(token).digest('hex');
  return `${UI_OIDC_REDIS_PREFIX}tokenemail:${digest}`;
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

export async function setUiOidcState(state: string, value: UiOidcStateRecord, ttlMs: number) {
  const client = await getRedisClient();
  await client.set(getStateKey(state), JSON.stringify(value), { PX: ttlMs });
}

export async function getUiOidcState(state: string) {
  const client = await getRedisClient();
  const raw = await client.get(getStateKey(state));
  if (!raw) return null;

  return JSON.parse(raw) as UiOidcStateRecord;
}

export async function deleteUiOidcState(state: string) {
  const client = await getRedisClient();
  await client.del(getStateKey(state));
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

export async function setUiOidcRefreshToken(email: string, refreshToken: string, ttlMs?: number) {
  const client = await getRedisClient();
  const effectiveTtl = ttlMs ?? REFRESH_TOKEN_MAX_TTL_MS;
  await client.set(getRefreshTokenKey(email), refreshToken, { PX: effectiveTtl });
}

export async function getUiOidcRefreshToken(email: string) {
  const client = await getRedisClient();
  return await client.get(getRefreshTokenKey(email));
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
  const keys = [getRefreshTokenKey(email), getIdTokenKey(email), getAccessTokenByEmailKey(email)];

  if (currentAccessToken) {
    keys.push(getAccessTokenRecordKey(currentAccessToken));
  }

  await client.del(keys);
}
