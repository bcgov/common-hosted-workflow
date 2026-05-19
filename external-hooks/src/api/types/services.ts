import type { User } from './user';
import type { UiApiService } from '../services/ui-api';

export type ApiKeyLookupService = {
  getUserForApiKey: (token: string) => Promise<User | null>;
};

export type ApiServices = {
  apiKey: ApiKeyLookupService;
  uiApi: UiApiService;
};
