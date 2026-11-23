import { Router, type Request, type Response } from 'express';
import { templatesCollectionsRequestSchema, templatesSearchRequestSchema } from '../schemas/templates';
import { getTemplateLibrary, type TemplateLibrary } from '../services/templates/library';
import {
  toCollectionDetail,
  toCollectionListItem,
  toTemplateDetail,
  toTemplateImport,
  toTemplateListItem,
} from '../services/templates/serializers';
import type { TemplateRecord } from '../services/templates/schema';
import type { ValidatedRequest } from '../utils/validation';
import { createRequestParser } from '../utils/validation';
import { NotFoundResponse, OkResponse } from './responses';

/**
 * Custom workflow template library, consumed by the n8n editor's in-app
 * template browser when `N8N_TEMPLATES_HOST` points at this router.
 *
 * Mounted at `/rest/custom/v1`, so the editor's axios client resolves:
 *   GET /rest/custom/v1/health
 *   GET /rest/custom/v1/templates/categories
 *   GET /rest/custom/v1/templates/collections
 *   GET /rest/custom/v1/templates/collections/:id
 *   GET /rest/custom/v1/templates/search
 *   GET /rest/custom/v1/templates/workflows/:id   (wrapped: { workflow })
 *   GET /rest/custom/v1/workflows/templates/:id   (flat import payload)
 *
 * Read-only, unauthenticated GETs: the browser sends no API key, and the data
 * is the same content the template browser displays publicly.
 */

/** Normalises `category=a,b`, `category[]=1&category[]=2`, and single values. */
function readListParam(query: Record<string, unknown>, name: string): string[] {
  const raw = query[name] ?? query[`${name}[]`];
  if (raw === undefined || raw === null || raw === '') return [];

  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Category filters may arrive as ids (collections) or names (search). */
function matchesCategories(categories: Array<{ id?: number; name: string }>, filters: string[]): boolean {
  if (!filters.length) return true;

  const wanted = new Set(filters.map((filter) => filter.toLowerCase()));
  return categories.some(
    (category) =>
      wanted.has(category.name.toLowerCase()) || (category.id !== undefined && wanted.has(String(category.id))),
  );
}

function matchesSearch(haystacks: string[], search: string): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  return haystacks.some((value) => value.toLowerCase().includes(needle));
}

function templateHaystacks(template: TemplateRecord): string[] {
  return [
    template.name,
    template.description,
    ...template.categories.map((category) => category.name),
    ...template.nodes.map((node) => node.displayName),
    ...template.nodes.map((node) => node.name),
    ...template.workflow.nodes.map((node) => node.name),
  ];
}

/** `nodes` is sent as node type ids; a template must contain all of them. */
function matchesNodeTypes(template: TemplateRecord, nodeTypes: string[]): boolean {
  if (!nodeTypes.length) return true;

  const present = new Set(template.workflow.nodes.map((node) => node.type));
  return nodeTypes.every((type) => present.has(type));
}

function sortTemplates(templates: TemplateRecord[], sort?: string): TemplateRecord[] {
  const sorted = [...templates];

  switch (sort) {
    case 'views':
      return sorted.sort((a, b) => b.totalViews - a.totalViews || a.id - b.id);
    case 'createdAt':
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id - b.id);
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    default:
      // Library order is curation order (`rank`, then `id`).
      return sorted;
  }
}

function parseId(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function buildTemplatesRouter(library: TemplateLibrary = getTemplateLibrary()): Router {
  const router = Router();

  /** The editor races this against a 2s timeout; it must stay trivial. */
  router.get('/health', (_req: Request, res: Response) => {
    OkResponse(res, { status: 'ok' });
  });

  router.get('/templates/categories', (_req: Request, res: Response) => {
    OkResponse(res, { categories: library.categories });
  });

  router.get(
    '/templates/collections',
    createRequestParser(templatesCollectionsRequestSchema),
    (req: Request, res: Response) => {
      const { search } = (req as ValidatedRequest<{ query: { search: string } }>).parsed.query;
      const categories = readListParam(req.query as Record<string, unknown>, 'category');

      const collections = library.collections.filter(
        (collection) =>
          matchesCategories(collection.categories, categories) &&
          matchesSearch([collection.name, collection.description], search),
      );

      OkResponse(res, { collections: collections.map(toCollectionListItem) });
    },
  );

  router.get('/templates/collections/:id', (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const collection = id === null ? undefined : library.collectionsById.get(id);

    if (!collection) return NotFoundResponse(res);
    return OkResponse(res, { collection: toCollectionDetail(collection, library) });
  });

  router.get('/templates/search', createRequestParser(templatesSearchRequestSchema), (req: Request, res: Response) => {
    const { page, limit, search, sort } = (
      req as ValidatedRequest<{ query: { page: number; limit: number; search: string; sort?: string } }>
    ).parsed.query;
    const query = req.query as Record<string, unknown>;

    const categories = readListParam(query, 'category');
    const nodeTypes = readListParam(query, 'nodes');

    const matches = library.templates.filter(
      (template) =>
        matchesCategories(template.categories, categories) &&
        matchesNodeTypes(template, nodeTypes) &&
        matchesSearch(templateHaystacks(template), search),
    );

    const sorted = sortTemplates(matches, sort);
    const start = (page - 1) * limit;

    OkResponse(res, {
      totalWorkflows: sorted.length,
      workflows: sorted.slice(start, start + limit).map(toTemplateListItem),
      // The editor reads categories from `/templates/categories`; facets are unused.
      filters: [],
    });
  });

  router.get('/templates/workflows/:id', (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const template = id === null ? undefined : library.templatesById.get(id);

    if (!template) return NotFoundResponse(res);
    return OkResponse(res, { workflow: toTemplateDetail(template) });
  });

  router.get('/workflows/templates/:id', (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const template = id === null ? undefined : library.templatesById.get(id);

    if (!template) return NotFoundResponse(res);
    return OkResponse(res, toTemplateImport(template));
  });

  return router;
}
