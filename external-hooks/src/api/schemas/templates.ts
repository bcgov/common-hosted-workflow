import { z } from 'zod';

/**
 * Query schemas for the templates API (`/rest/custom/v1/templates/*`).
 *
 * The n8n editor's templates client sends:
 *  - `search`:        `page`, `limit`, `search`, `category` (comma-joined names)
 *  - `collections`:   `search`, `category[]` (category ids)
 * Both shapes are normalised in the route. Express 5's simple query parser
 * leaves repeated `category[]=1&category[]=2` values under the `category[]`
 * key, while `category=1,2` stays a single string.
 */

export const templateSearchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().default(''),
  sort: z.string().trim().optional(),
});

export const templatesSearchRequestSchema = z.object({
  body: z.record(z.string(), z.unknown()).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  query: templateSearchQuerySchema,
});

export const templatesCollectionsRequestSchema = z.object({
  body: z.record(z.string(), z.unknown()).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.object({
    search: z.string().trim().default(''),
  }),
});

export type TemplateSearchQuery = z.infer<typeof templateSearchQuerySchema>;
