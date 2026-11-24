import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EXTERNAL_HOOK_ASSETS_PATH, N8N_BASE_URL } from '@config';
import { createLogger } from '../../utils/logger';
import {
  collectionRecordSchema,
  collectionsFileSchema,
  templateRecordSchema,
  type TemplateCategory,
  type TemplateCollection,
  type TemplateRecord,
} from './schema';

const log = createLogger('Templates');

/** `<assets>/templates` — inside the image this is `/external-hooks/api/assets/templates`. */
export const TEMPLATES_DIR = path.join(EXTERNAL_HOOK_ASSETS_PATH, 'templates');

export interface TemplateLibrary {
  /** Every template, in curation order (`rank`, then `id`). */
  templates: TemplateRecord[];
  templatesById: Map<number, TemplateRecord>;
  collections: TemplateCollection[];
  collectionsById: Map<number, TemplateCollection>;
  /** Union of every category referenced by a template or collection. */
  categories: TemplateCategory[];
}

const EMPTY_LIBRARY: TemplateLibrary = {
  templates: [],
  templatesById: new Map(),
  collections: [],
  collectionsById: new Map(),
  categories: [],
};

/**
 * Turns `/assets/...` into an absolute URL for both templates and collections.
 * The editor renders markdown image URLs against the templates host, not against
 * the current page, so root-relative paths need the n8n origin added explicitly.
 */
export function absolutizeImageUrls<T extends { image: Array<{ id: number; url: string }> }>(
  record: T,
  baseUrl = N8N_BASE_URL,
): T {
  if (!record.image.length || !baseUrl) return record;

  const base = baseUrl.replace(/\/+$/, '');
  return {
    ...record,
    image: record.image.map((image) => {
      if (/^(https?:)?\/\//.test(image.url)) return image;
      const suffix = image.url.startsWith('/') ? image.url : `/${image.url}`;
      return { ...image, url: `${base}${suffix}` };
    }),
  };
}

function compareTemplates(a: TemplateRecord, b: TemplateRecord): number {
  const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
  const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;
  return rankA - rankB || a.id - b.id;
}

function readTemplateFile(dir: string, slug: string): TemplateRecord | null {
  const file = path.join(dir, slug, 'template.json');

  if (!existsSync(file)) {
    log.warn('Template directory has no template.json; skipping', { slug, file });
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    log.error('Template file is not valid JSON; skipping', {
      slug,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const parsed = templateRecordSchema.safeParse(raw);
  if (!parsed.success) {
    log.error('Template file does not match the template schema; skipping', {
      slug,
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
    return null;
  }

  return absolutizeImageUrls(parsed.data);
}

function loadCollections(dir: string, templatesById: Map<number, TemplateRecord>): TemplateCollection[] {
  const file = path.join(dir, 'collections.json');
  if (!existsSync(file)) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    log.error('collections.json is not valid JSON; ignoring collections', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  // Accept both a bare array and `{ "collections": [...] }`.
  const parsed = collectionsFileSchema.safeParse(Array.isArray(raw) ? { collections: raw } : raw);
  if (!parsed.success) {
    log.error('collections.json does not match the collection schema; ignoring collections', {
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
    return [];
  }

  const seenIds = new Set<number>();

  return parsed.data.collections
    .filter((collection) => {
      if (!seenIds.has(collection.id)) {
        seenIds.add(collection.id);
        return true;
      }

      log.error('Duplicate collection id; skipping later entry', {
        id: collection.id,
        collection: collection.name,
      });
      return false;
    })
    .map((collection) => {
      const missing = collection.workflowIds.filter((id) => !templatesById.has(id));
      if (missing.length) {
        log.warn('Collection references unknown template ids', { collection: collection.name, missing });
      }

      const workflowIds = collection.workflowIds.filter((id) => templatesById.has(id));
      const derivedNodes = new Map<string, TemplateRecord['nodes'][number]>();
      for (const id of workflowIds) {
        for (const node of templatesById.get(id)?.nodes ?? []) {
          if (!derivedNodes.has(node.name)) derivedNodes.set(node.name, node);
        }
      }

      return absolutizeImageUrls({
        ...collection,
        workflowIds,
        // Empty means "derive from members"; an explicit non-empty list wins.
        nodes: collection.nodes.length ? collection.nodes : [...derivedNodes.values()],
      });
    })
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.id - b.id);
}

function collectCategories(templates: TemplateRecord[], collections: TemplateCollection[]): TemplateCategory[] {
  const byName = new Map<string, TemplateCategory>();

  for (const category of [
    ...templates.flatMap((template) => template.categories),
    ...collections.flatMap((collection) => collection.categories),
  ]) {
    const key = category.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, category);
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Reads the whole library from disk once. Bad files are logged and skipped so a
 * typo can never take the n8n instance down; the test suite loads the real
 * directory, which is what keeps the data honest.
 */
export function loadTemplateLibrary(dir = TEMPLATES_DIR): TemplateLibrary {
  if (!existsSync(dir)) {
    log.warn('Templates directory not found; the template library is empty', { dir });
    return { ...EMPTY_LIBRARY, templatesById: new Map(), collectionsById: new Map() };
  }

  const slugs = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const templates: TemplateRecord[] = [];
  const templatesById = new Map<number, TemplateRecord>();

  for (const slug of slugs) {
    const template = readTemplateFile(dir, slug);
    if (!template) continue;

    if (templatesById.has(template.id)) {
      log.error('Duplicate template id; skipping later file', {
        slug,
        id: template.id,
        existing: templatesById.get(template.id)?.name,
      });
      continue;
    }

    templatesById.set(template.id, template);
    templates.push(template);
  }

  templates.sort(compareTemplates);

  const collections = loadCollections(dir, templatesById);

  log.info('Template library loaded', {
    dir,
    templates: templates.length,
    collections: collections.length,
  });

  return {
    templates,
    templatesById,
    collections,
    collectionsById: new Map(collections.map((collection) => [collection.id, collection])),
    categories: collectCategories(templates, collections),
  };
}

let cached: TemplateLibrary | null = null;

/** Process-wide library, loaded when the templates router is constructed. */
export function getTemplateLibrary(): TemplateLibrary {
  cached ??= loadTemplateLibrary();
  return cached;
}

/** Test helper: drops the cached library so the next call re-reads disk. */
export function resetTemplateLibrary(): void {
  cached = null;
}
