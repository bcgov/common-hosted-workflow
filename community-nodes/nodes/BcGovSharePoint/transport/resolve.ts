import type { IDataObject, IHttpRequestOptions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { graphRequest, graphPagedRequest, type GraphContext, type RetryOptions } from './graphRequest';
import { TtlCache, buildCacheKey } from './cache';

export const SYSTEM_COLUMN_DENY_LIST = [
  'ID',
  'ContentType',
  'Created',
  'Modified',
  'Author',
  'Editor',
  '_UIVersionString',
  'Attachments',
  'Edit',
  'LinkTitle',
  'LinkTitleNoMenu',
  'DocIcon',
  'ItemChildCount',
  'FolderChildCount',
  'AppAuthor',
  'AppEditor',
  '_ColorTag',
  'ComplianceAssetId',
  '_IsRecord',
] as const;

const COMPLIANCE_PREFIX = '_Compliance';
const LINK_TITLE_NAMES = new Set(['LinkTitle', 'LinkTitleNoMenu']);
const TITLE_INTERNAL_NAME = 'Title';

export type ColumnType =
  | 'text'
  | 'note'
  | 'choice'
  | 'number'
  | 'currency'
  | 'boolean'
  | 'dateTime'
  | 'personOrGroup'
  | 'lookup'
  | 'hyperlinkOrPicture'
  | 'calculated'
  | 'contentApprovalStatus'
  | 'thumbnail'
  | 'other';

const READ_ONLY_TYPES: ReadonlySet<ColumnType> = new Set(['calculated', 'contentApprovalStatus', 'thumbnail']);

export interface GraphColumn {
  name: string;
  displayName: string;
  readOnly?: boolean;
  required?: boolean;
  text?: unknown;
  note?: unknown;
  choice?: { choices?: string[]; allowMultipleSelection?: boolean; displayAs?: string };
  number?: unknown;
  currency?: unknown;
  boolean?: unknown;
  dateTime?: unknown;
  personOrGroup?: { allowMultipleSelection?: boolean };
  lookup?: { listId?: string; columnName?: string; allowMultipleValues?: boolean };
  hyperlinkOrPicture?: unknown;
  calculated?: unknown;
  contentApprovalStatus?: unknown;
  thumbnail?: unknown;
}

export interface ColumnMapEntry {
  internalName: string;
  displayName: string;
  type: ColumnType;
  required: boolean;
  choices?: string[];
  allowMultiple?: boolean;
  lookup?: { listId?: string; column?: string };
}

export interface ColumnMap {
  byDisplayName: Map<string, ColumnMapEntry>;
  byInternalName: Map<string, ColumnMapEntry>;
}

export class ColumnAmbiguityError extends Error {
  constructor(
    public readonly displayName: string,
    public readonly internalNames: string[],
  ) {
    super(
      `Display name "${displayName}" matches multiple columns (${internalNames.join(', ')}). Address the field by internal name.`,
    );
    this.name = 'ColumnAmbiguityError';
  }
}

function isDenied(name: string): boolean {
  return (SYSTEM_COLUMN_DENY_LIST as readonly string[]).includes(name) || name.startsWith(COMPLIANCE_PREFIX);
}

function classifyType(column: GraphColumn): ColumnType {
  if (column.text) return 'text';
  if (column.note) return 'note';
  if (column.choice) return 'choice';
  if (column.number) return 'number';
  if (column.currency) return 'currency';
  if (column.boolean !== undefined) return 'boolean';
  if (column.dateTime) return 'dateTime';
  if (column.personOrGroup) return 'personOrGroup';
  if (column.lookup) return 'lookup';
  if (column.hyperlinkOrPicture) return 'hyperlinkOrPicture';
  if (column.calculated) return 'calculated';
  if (column.contentApprovalStatus) return 'contentApprovalStatus';
  if (column.thumbnail) return 'thumbnail';
  return 'other';
}

function toEntry(column: GraphColumn): ColumnMapEntry {
  const type = classifyType(column);
  return {
    internalName: column.name,
    displayName: column.displayName,
    type,
    required: column.required ?? false,
    choices: column.choice?.choices,
    allowMultiple:
      // Graph's choicecolumn facet has no `allowMultipleSelection` property —
      // a multi-select choice column is only distinguishable by
      // `displayAs: "checkBoxes"` (single-select uses "dropDownMenu" or
      // "radioButtons").
      (column.choice ? column.choice.displayAs === 'checkBoxes' : undefined) ??
      column.personOrGroup?.allowMultipleSelection ??
      column.lookup?.allowMultipleValues,
    lookup: column.lookup ? { listId: column.lookup.listId, column: column.lookup.columnName } : undefined,
  };
}

function registerDisplayName(
  byDisplayName: Map<string, ColumnMapEntry>,
  conflicts: Map<string, string[]>,
  displayName: string,
  entry: ColumnMapEntry,
): void {
  const key = displayName.toLowerCase();
  const existingNames = conflicts.get(key) ?? [];
  if (!existingNames.includes(entry.internalName)) {
    existingNames.push(entry.internalName);
  }
  conflicts.set(key, existingNames);
  byDisplayName.set(key, entry);
}

/**
 * Build the writable display-name -> internal-name column map from a Graph
 * `columns` response (spec section 6.2): drops system/read-only columns,
 * remaps a renamed Title's display name from LinkTitle back onto Title, and
 * throws ColumnAmbiguityError when two writable columns share a display name.
 */
export function buildColumnMap(columns: GraphColumn[]): ColumnMap {
  const titleColumn = columns.find((column) => column.name === TITLE_INTERNAL_NAME);

  const byDisplayName = new Map<string, ColumnMapEntry>();
  const byInternalName = new Map<string, ColumnMapEntry>();
  const conflicts = new Map<string, string[]>();

  for (const column of columns) {
    const isReadOnly = column.readOnly === true || READ_ONLY_TYPES.has(classifyType(column));
    const isSystem = isDenied(column.name);

    if (isReadOnly || isSystem) {
      if (LINK_TITLE_NAMES.has(column.name) && titleColumn) {
        registerDisplayName(byDisplayName, conflicts, column.displayName, toEntry(titleColumn));
      }
      continue;
    }

    const entry = toEntry(column);
    byInternalName.set(entry.internalName, entry);
    registerDisplayName(byDisplayName, conflicts, entry.displayName, entry);
  }

  for (const [key, internalNames] of conflicts) {
    if (internalNames.length > 1) {
      const displayName = byDisplayName.get(key)?.displayName ?? key;
      throw new ColumnAmbiguityError(displayName, internalNames);
    }
  }

  return { byDisplayName, byInternalName };
}

export interface ResolvedSite {
  siteId: string;
  hostname: string;
  siteCollectionId: string;
  webId: string;
}

export type SiteInput =
  | { mode: 'url'; value: string }
  | { mode: 'hostPath'; hostname: string; path: string }
  | { mode: 'id'; value: string };

function parseSiteUrl(context: GraphContext, url: string): { hostname: string; path: string } {
  try {
    const parsed = new URL(url);
    return { hostname: parsed.hostname, path: parsed.pathname.replace(/\/$/, '') };
  } catch {
    throw new NodeOperationError(
      context.getNode(),
      `Site URL must look like https://<tenant>.sharepoint.com/sites/<SiteName> — received: "${url}"`,
    );
  }
}

function parseCompositeSiteId(id: string): ResolvedSite {
  const [hostname, siteCollectionId, webId] = id.split(',');
  return { siteId: id, hostname, siteCollectionId, webId };
}

/**
 * Resolve a site to its composite Graph site ID. Sites.Selected cannot
 * enumerate sites (spec section 3), so the site must always be addressed
 * by URL, host+path, or a pre-known composite ID — never a picker.
 */
export async function resolveSiteId(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  input: SiteInput,
): Promise<ResolvedSite> {
  if (input.mode === 'id') {
    return parseCompositeSiteId(input.value);
  }

  const { hostname, path } = input.mode === 'url' ? parseSiteUrl(context, input.value) : input;
  const options: IHttpRequestOptions = {
    method: 'GET',
    url: `${baseUrl}/sites/${hostname}:${path}`,
    json: true,
  };
  const response = await graphRequest<{ id: string }>(context, options, retry);
  return parseCompositeSiteId(response.id);
}

export type ListInput = { mode: 'name'; value: string } | { mode: 'id'; value: string };

async function tryFilteredListLookup(
  context: GraphContext,
  retry: RetryOptions,
  options: IHttpRequestOptions,
  wantedDisplayName: string,
): Promise<string | undefined> {
  try {
    const response = await graphRequest<{ value: Array<{ id: string; displayName: string }> }>(context, options, retry);
    const first = response.value[0];
    return first?.displayName?.toLowerCase() === wantedDisplayName.toLowerCase() ? first.id : undefined;
  } catch {
    return undefined;
  }
}

async function resolveListIdByEnumeration(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  displayName: string,
  extraQs?: IDataObject,
): Promise<string> {
  const lists = await graphPagedRequest<{ id: string; displayName: string }>(
    context,
    { method: 'GET', url: `${baseUrl}/sites/${siteId}/lists`, qs: { ...extraQs }, json: true },
    retry,
    { returnAll: true },
  );

  const match = lists.find((list) => list.displayName.toLowerCase() === displayName.toLowerCase());
  if (!match) {
    const available = lists.map((list) => list.displayName).join(', ');
    throw new NodeOperationError(
      context.getNode(),
      `List "${displayName}" not found on site. Available lists: ${available}.`,
    );
  }
  return match.id;
}

/**
 * $filter on displayName is unreliable across tenants (spec section 6.1) —
 * always attempt it first, but fall back to full paged enumeration with a
 * case-insensitive match on 400/empty rather than trusting the filter alone.
 */
export async function resolveListId(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  input: ListInput,
  extraQs?: IDataObject,
): Promise<string> {
  if (input.mode === 'id') return input.value;

  const filterOptions: IHttpRequestOptions = {
    method: 'GET',
    url: `${baseUrl}/sites/${siteId}/lists`,
    qs: { ...extraQs, $filter: `displayName eq '${input.value.replace(/'/g, "''")}'` },
    json: true,
  };

  const filtered = await tryFilteredListLookup(context, retry, filterOptions, input.value);
  if (filtered) return filtered;

  return resolveListIdByEnumeration(context, baseUrl, retry, siteId, input.value, extraQs);
}

export type DriveInput = { mode: 'default' } | { mode: 'name'; value: string } | { mode: 'id'; value: string };

/**
 * The node must select the document library (drive) explicitly, not assume
 * the default — the current hand-built workflow's /drive/root: shortcut
 * breaks on any site with more than one library (spec section 7.1).
 */
export async function resolveDriveId(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  input: DriveInput,
): Promise<string> {
  if (input.mode === 'id') return input.value;

  if (input.mode === 'default') {
    const response = await graphRequest<{ id: string }>(
      context,
      { method: 'GET', url: `${baseUrl}/sites/${siteId}/drive`, json: true },
      retry,
    );
    return response.id;
  }

  const drives = await graphPagedRequest<{ id: string; name: string }>(
    context,
    { method: 'GET', url: `${baseUrl}/sites/${siteId}/drives`, json: true },
    retry,
    { returnAll: true },
  );
  const match = drives.find((drive) => drive.name.toLowerCase() === input.value.toLowerCase());
  if (!match) {
    const available = drives.map((drive) => drive.name).join(', ');
    throw new NodeOperationError(
      context.getNode(),
      `Document library "${input.value}" not found on site. Available libraries: ${available}.`,
    );
  }
  return match.id;
}

/**
 * Fetch a list's columns and build its display-name -> internal-name map.
 */
export async function getColumnMap(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  listId: string,
): Promise<ColumnMap> {
  const columns = await graphPagedRequest<GraphColumn>(
    context,
    { method: 'GET', url: `${baseUrl}/sites/${siteId}/lists/${listId}/columns`, json: true },
    retry,
    { returnAll: true },
  );

  try {
    return buildColumnMap(columns);
  } catch (error) {
    if (error instanceof ColumnAmbiguityError) {
      throw new NodeOperationError(context.getNode(), error.message);
    }
    throw error;
  }
}

const USER_INFO_LIST_NAME = 'User Information List';

export interface PersonLookupResult {
  email: string;
  lookupId: number;
  displayName: string;
  userName: string;
}

interface UserListItem {
  id: string;
  fields: { EMail?: string; UserName?: string; Title?: string };
}

/**
 * Resolve a person's SharePoint LookupId from their email via the hidden
 * User Information List — Person fields require this integer, but workflow
 * authors should only ever have to supply an email (spec section 6.3).
 */
export async function resolvePersonLookupId(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  email: string,
): Promise<PersonLookupResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const userListId = await resolveListId(
    context,
    baseUrl,
    retry,
    siteId,
    { mode: 'name', value: USER_INFO_LIST_NAME },
    { includeHiddenLists: true },
  );

  const users = await graphPagedRequest<UserListItem>(
    context,
    {
      method: 'GET',
      url: `${baseUrl}/sites/${siteId}/lists/${userListId}/items`,
      qs: { $expand: 'fields($select=EMail,UserName,Title,Id,ContentType)', $top: 999 },
      json: true,
    },
    retry,
    { returnAll: true },
  );

  const match = users.find((user) => {
    const userEmail = user.fields.EMail?.trim().toLowerCase();
    const userName = user.fields.UserName?.trim().toLowerCase();
    return userEmail === normalizedEmail || userName === normalizedEmail;
  });

  if (!match) {
    throw new NodeOperationError(
      context.getNode(),
      `No SharePoint principal found for ${email} on this site. The user must access the site at least once, or be provisioned via ensureUser.`,
    );
  }

  return {
    email,
    lookupId: Number(match.id),
    displayName: match.fields.Title ?? '',
    userName: match.fields.UserName ?? '',
  };
}

/**
 * Resolve a Lookup column's target item ID from its display value — the
 * caller must send the non-indexed-query header since lookup columns are
 * rarely indexed (spec section 3).
 */
export async function resolveLookupItemId(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  targetListId: string,
  column: string,
  value: string,
): Promise<number> {
  const escapedValue = value.replace(/'/g, "''");
  const items = await graphPagedRequest<{ id: string }>(
    context,
    {
      method: 'GET',
      url: `${baseUrl}/sites/${siteId}/lists/${targetListId}/items`,
      qs: { $expand: 'fields', $filter: `fields/${column} eq '${escapedValue}'` },
      headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
      json: true,
    },
    retry,
    { returnAll: false, limit: 1 },
  );

  const match = items[0];
  if (!match) {
    throw new NodeOperationError(
      context.getNode(),
      `No item found in the target list where "${column}" equals "${value}".`,
    );
  }
  return Number(match.id);
}

async function withCache<T>(
  cache: TtlCache<unknown>,
  credentialId: string,
  scopeKey: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const key = buildCacheKey(credentialId, scopeKey);
  const cached = cache.get(key) as T | undefined;
  if (cached !== undefined) return cached;
  const value = await fetcher();
  cache.set(key, value);
  return value;
}

export interface CachedResolvers {
  resolveSiteId: (input: SiteInput) => Promise<ResolvedSite>;
  resolveListId: (siteId: string, input: ListInput) => Promise<string>;
  resolveDriveId: (siteId: string, input: DriveInput) => Promise<string>;
  getColumnMap: (siteId: string, listId: string) => Promise<ColumnMap>;
}

/**
 * Cache-wrapped resolvers for use by action handlers. Metadata (site/list/
 * drive/column IDs) is stable and expensive to fetch — without this, a
 * 500-item loop issues thousands of redundant Graph calls (spec section 9).
 * Action handlers should call these, never the raw resolve* functions directly.
 */
export function createCachedResolvers(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  cache: TtlCache<unknown>,
  credentialId: string,
): CachedResolvers {
  return {
    resolveSiteId: (input) =>
      withCache(cache, credentialId, `site:${JSON.stringify(input)}`, () =>
        resolveSiteId(context, baseUrl, retry, input),
      ),
    resolveListId: (siteId, input) =>
      withCache(cache, credentialId, `list:${siteId}:${JSON.stringify(input)}`, () =>
        resolveListId(context, baseUrl, retry, siteId, input),
      ),
    resolveDriveId: (siteId, input) =>
      withCache(cache, credentialId, `drive:${siteId}:${JSON.stringify(input)}`, () =>
        resolveDriveId(context, baseUrl, retry, siteId, input),
      ),
    getColumnMap: (siteId, listId) =>
      withCache(cache, credentialId, `columns:${siteId}:${listId}`, () =>
        getColumnMap(context, baseUrl, retry, siteId, listId),
      ),
  };
}
