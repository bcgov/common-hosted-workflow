import type { ILoadOptionsFunctions, INodeListSearchResult, INodePropertyOptions } from 'n8n-workflow';
import {
  GRAPH_CREDENTIAL_TYPE,
  graphPagedRequest,
  type GraphContext,
  type RetryOptions,
} from '../transport/graphRequest';
import { createCachedResolvers, type SiteInput, type ListInput } from '../transport/resolve';
import { getCacheForCredential } from '../transport/cache';

interface LoadOptionsCredentials {
  tenantId: string;
  clientId: string;
  graphBaseUrl: string;
  defaultSiteUrl: string;
  maxRetries: number;
  cacheTtlMinutes: number;
}

function buildGraphContext(self: ILoadOptionsFunctions): GraphContext {
  return {
    helpers: {
      httpRequestWithAuthentication: (credentialType, options) =>
        self.helpers.httpRequestWithAuthentication.call(self, credentialType, options),
    },
    getNode: () => self.getNode(),
  };
}

function parseSiteParam(raw: { mode: string; value?: string }, defaultSiteUrl: string): SiteInput {
  const value = raw.value?.trim();
  if (!value) return { mode: 'url', value: defaultSiteUrl };
  if (raw.mode === 'id') return { mode: 'id', value };
  if (raw.mode === 'hostPath') {
    const [hostname, ...pathParts] = value.split('/');
    return { mode: 'hostPath', hostname, path: `/${pathParts.join('/')}` };
  }
  return { mode: 'url', value };
}

/**
 * Site/list/column metadata is stable and expensive to fetch — without this,
 * every open of the "add field" column picker re-issues the same site/list/
 * columns Graph calls. Reuses the same per-credential TtlCache as the
 * execute() path (spec section 9) so a warm cache serves both.
 */
function getResolvers(
  self: ILoadOptionsFunctions,
  context: GraphContext,
  credentials: LoadOptionsCredentials,
  retry: RetryOptions,
) {
  const credentialId = `${credentials.tenantId}:${credentials.clientId}`;
  // Mirrors execute()'s "Refresh Metadata Cache" toggle — reading it here
  // means checking it also busts the cache backing these loadOptions
  // dropdowns (e.g. after adding a column in SharePoint), not just the
  // next actual run.
  const refreshCache = self.getNodeParameter('refreshCache', false) as boolean;
  const cache = getCacheForCredential(credentialId, credentials.cacheTtlMinutes, refreshCache);
  return createCachedResolvers(context, credentials.graphBaseUrl, retry, cache, credentialId);
}

async function resolveCurrentSiteId(
  self: ILoadOptionsFunctions,
  resolvers: ReturnType<typeof getResolvers>,
  credentials: LoadOptionsCredentials,
): Promise<string> {
  const siteRaw = self.getNodeParameter('site', { mode: 'url', value: '' }) as { mode: string; value?: string };
  const siteInput = parseSiteParam(siteRaw, credentials.defaultSiteUrl);
  const { siteId } = await resolvers.resolveSiteId(siteInput);
  return siteId;
}

interface GraphList {
  id: string;
  displayName: string;
}

/**
 * Backs the List resourceLocator's "From List" mode. Returns lists matching
 * the user's filter text (if any), with pagination support.
 */
export async function searchLists(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
  const credentials = await this.getCredentials<LoadOptionsCredentials>(GRAPH_CREDENTIAL_TYPE);
  const context = buildGraphContext(this);
  const retry: RetryOptions = { maxRetries: Math.min(credentials.maxRetries, 2) };
  const baseUrl = credentials.graphBaseUrl;
  const resolvers = getResolvers(this, context, credentials, retry);
  const siteId = await resolveCurrentSiteId(this, resolvers, credentials);

  const lists = await graphPagedRequest<GraphList>(
    context,
    {
      method: 'GET',
      url: `${baseUrl}/sites/${siteId}/lists`,
      qs: { $select: 'id,displayName' },
      json: true,
    },
    retry,
    { returnAll: true },
  );

  const normalizedFilter = filter?.trim().toLowerCase();
  const filtered = normalizedFilter
    ? lists.filter((l) => l.displayName.toLowerCase().includes(normalizedFilter))
    : lists;

  return {
    results: filtered.map((l) => ({ name: l.displayName, value: l.id })),
  };
}

interface GraphDrive {
  id: string;
  name: string;
}

/**
 * Backs the Document Library resourceLocator's "From List" mode.
 */
export async function searchDrives(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
  const credentials = await this.getCredentials<LoadOptionsCredentials>(GRAPH_CREDENTIAL_TYPE);
  const context = buildGraphContext(this);
  const retry: RetryOptions = { maxRetries: Math.min(credentials.maxRetries, 2) };
  const baseUrl = credentials.graphBaseUrl;
  const resolvers = getResolvers(this, context, credentials, retry);
  const siteId = await resolveCurrentSiteId(this, resolvers, credentials);

  const drives = await graphPagedRequest<GraphDrive>(
    context,
    {
      method: 'GET',
      url: `${baseUrl}/sites/${siteId}/drives`,
      qs: { $select: 'id,name' },
      json: true,
    },
    retry,
    { returnAll: true },
  );

  const normalizedFilter = filter?.trim().toLowerCase();
  const filtered = normalizedFilter ? drives.filter((d) => d.name.toLowerCase().includes(normalizedFilter)) : drives;

  return {
    results: filtered.map((d) => ({ name: d.name, value: d.id })),
  };
}

function parseListParam(raw: { mode: string; value?: string }): ListInput {
  if (raw.mode === 'id' || raw.mode === 'list') return { mode: 'id', value: String(raw.value) };
  return { mode: 'name', value: String(raw.value) };
}

/**
 * Returns the writable column display names for the currently selected list.
 * Backs the "Pick Fields" column dropdown so users don't need to remember column names.
 */
export async function getColumnNames(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  const credentials = await this.getCredentials<LoadOptionsCredentials>(GRAPH_CREDENTIAL_TYPE);
  const context = buildGraphContext(this);
  const retry: RetryOptions = { maxRetries: Math.min(credentials.maxRetries, 2) };
  const resolvers = getResolvers(this, context, credentials, retry);
  const siteId = await resolveCurrentSiteId(this, resolvers, credentials);

  const listRaw = this.getNodeParameter('list', { mode: 'name', value: '' }) as { mode: string; value?: string };
  const listInput = parseListParam(listRaw);
  const listId = await resolvers.resolveListId(siteId, listInput);
  const columnMap = await resolvers.getColumnMap(siteId, listId);

  const options: INodePropertyOptions[] = [];
  for (const [, entry] of columnMap.byDisplayName.entries()) {
    options.push({ name: entry.displayName, value: entry.displayName });
  }
  return options.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
