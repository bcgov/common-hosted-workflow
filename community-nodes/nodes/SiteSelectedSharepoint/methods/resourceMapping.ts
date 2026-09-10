import type { ILoadOptionsFunctions, ResourceMapperFields, ResourceMapperField } from 'n8n-workflow';
import { GRAPH_CREDENTIAL_TYPE, type GraphContext, type RetryOptions } from '../transport/graphRequest';
import {
  resolveSiteId,
  resolveListId,
  getColumnMap,
  type ColumnMapEntry,
  type ColumnType,
  type SiteInput,
  type ListInput,
} from '../transport/resolve';

interface ResourceMappingCredentials {
  graphBaseUrl: string;
  defaultSiteUrl: string;
  maxRetries: number;
}

function columnTypeToFieldType(colType: ColumnType): ResourceMapperField['type'] {
  switch (colType) {
    case 'number':
    case 'currency':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'dateTime':
      return 'dateTime';
    default:
      return 'string';
  }
}

function entryToField(displayName: string, entry: ColumnMapEntry): ResourceMapperField {
  const field: ResourceMapperField = {
    id: entry.internalName,
    displayName,
    required: entry.required,
    defaultMatch: entry.internalName === 'Title',
    canBeUsedToMatch: true,
    display: true,
    type: columnTypeToFieldType(entry.type),
  };
  if (entry.choices && entry.choices.length > 0) {
    field.options = entry.choices.map((c) => ({ name: c, value: c }));
  }
  return field;
}

function resolveSiteInput(siteRaw: { mode: string; value?: string }, siteValue: string): SiteInput {
  if (siteRaw.mode === 'id') {
    return { mode: 'id', value: siteRaw.value?.trim() ?? '' };
  }
  if (siteRaw.mode === 'hostPath') {
    const [hostname, ...pathParts] = (siteRaw.value?.trim() ?? '').split('/');
    return { mode: 'hostPath', hostname, path: `/${pathParts.join('/')}` };
  }
  return { mode: 'url', value: siteValue };
}

/**
 * Resource mapper backing for Item Create / Update / Create or Update.
 * Returns the writable columns for the selected list as ResourceMapperFields,
 * with display names as labels and correct types (spec section 8).
 */
export async function getListColumns(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
  const credentials = await this.getCredentials<ResourceMappingCredentials>(GRAPH_CREDENTIAL_TYPE);
  const context: GraphContext = {
    helpers: {
      httpRequestWithAuthentication: (credentialType, options) =>
        this.helpers.httpRequestWithAuthentication.call(this, credentialType, options),
    },
    getNode: () => this.getNode(),
  };
  const retry: RetryOptions = { maxRetries: Math.min(credentials.maxRetries, 2) };
  const baseUrl = credentials.graphBaseUrl;

  // Resolve site
  const siteRaw = this.getNodeParameter('site', { mode: 'url', value: '' }) as { mode: string; value?: string };
  const siteValue = siteRaw.value?.trim() ? siteRaw.value : credentials.defaultSiteUrl;
  const siteInput: SiteInput = resolveSiteInput(siteRaw, siteValue);
  const { siteId } = await resolveSiteId(context, baseUrl, retry, siteInput);

  // Resolve list
  const listRaw = this.getNodeParameter('list', { mode: 'name', value: '' }) as { mode: string; value?: string };
  const listInput: ListInput =
    listRaw.mode === 'id'
      ? { mode: 'id', value: String(listRaw.value) }
      : { mode: 'name', value: String(listRaw.value) };
  const listId = await resolveListId(context, baseUrl, retry, siteId, listInput);

  // Get column map and transform
  const columnMap = await getColumnMap(context, baseUrl, retry, siteId, listId);
  const fields: ResourceMapperField[] = [];
  for (const [, entry] of columnMap.byDisplayName.entries()) {
    fields.push(entryToField(entry.displayName, entry));
  }

  return { fields };
}
