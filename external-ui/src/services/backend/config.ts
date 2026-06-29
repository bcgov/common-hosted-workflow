import { instance } from './axios';

export type ConfigResponse = {
  featureFlags: Record<string, boolean>;
};

export function getConfig(params?: { signal?: AbortSignal }): Promise<ConfigResponse> {
  return instance.get<ConfigResponse>('/ui-api/config', { signal: params?.signal }).then((res) => res.data);
}
