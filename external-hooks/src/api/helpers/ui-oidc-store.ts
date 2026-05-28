import { createClient, type RedisClientType } from 'redis';

type UiOidcStateRecord = {
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  redirectUri: string;
};

let redisClientPromise: Promise<RedisClientType> | null = null;

function getRedisUrl() {
  return process.env.UI_OIDC_REDIS_URL || 'redis://localhost:6379';
}

function getRedisPrefix() {
  return process.env.UI_OIDC_REDIS_PREFIX || 'chwf:ui-oidc:';
}

function getStateKey(state: string) {
  return `${getRedisPrefix()}state:${state}`;
}

async function getRedisClient() {
  if (!redisClientPromise) {
    const client = createClient({ url: getRedisUrl() });
    client.on('error', () => {});
    redisClientPromise = client.connect().then(() => client);
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
