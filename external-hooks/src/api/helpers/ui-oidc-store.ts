import { createClient } from 'redis';
import { UI_OIDC_REDIS_URL, UI_OIDC_REDIS_PASSWORD, UI_OIDC_REDIS_PREFIX } from '@config';

type UiOidcStateRecord = {
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  redirectUri: string;
};

type RedisClient = Awaited<ReturnType<typeof createClient>>;

let redisClientPromise: Promise<RedisClient> | null = null;

function getStateKey(state: string) {
  return `${UI_OIDC_REDIS_PREFIX}state:${state}`;
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
