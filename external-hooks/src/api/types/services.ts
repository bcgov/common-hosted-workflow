import type { User } from './user';

export type ApiKeyLookupService = {
  getUserForApiKey: (token: string) => Promise<User | null>;
};

export type ApiServices = {
  apiKey: ApiKeyLookupService;
};
