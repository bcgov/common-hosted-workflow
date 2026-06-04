import type { CustomRepositoryService } from '../services/custom-repository';
import type { N8nRepositories } from './n8n-adapters';

/** n8n DI-backed repositories and helpers (from Container / TypeORM). */
export type { N8nRepositories };

/** Drizzle / custom DB repositories for CHWF tables. */
export type { CustomRepositoryService };
