import {
  NodeConnectionTypes,
  NodeApiError,
  NodeOperationError,
  type IExecuteFunctions,
  type INodeExecutionData,
  type IDataObject,
  type INodeType,
  type INodeTypeDescription,
  type GenericValue,
} from 'n8n-workflow';
import {
  GRAPH_CREDENTIAL_TYPE,
  type GraphContext,
  type RetryOptions,
  type BinaryRequestContext,
} from './transport/graphRequest';
import { getCacheForCredential } from './transport/cache';
import { createCachedResolvers, type SiteInput, type ListInput, type DriveInput } from './transport/resolve';
import { createItem } from './actions/item/create';
import { updateItem } from './actions/item/update';
import { deleteItem } from './actions/item/delete';
import { getItem } from './actions/item/get';
import { getManyItems, type SimpleFilterCondition } from './actions/item/getMany';
import { createOrUpdateItem } from './actions/item/createOrUpdate';
import { getUserLookupId } from './actions/user/getLookupId';
import { getManyUsers } from './actions/user/getMany';
import { downloadFile } from './actions/file/download';
import { uploadFile, type UploadFileOptions } from './actions/file/upload';
import { updateFile, type UpdateFileOptions } from './actions/file/update';
import { getFile } from './actions/file/get';
import { getManyFiles } from './actions/file/getMany';
import { listFolder } from './actions/file/listFolder';
import { deleteFile } from './actions/file/delete';
import { getList } from './actions/list/get';
import { getManyLists } from './actions/list/getMany';
import { searchLists, searchDrives, getColumnNames } from './methods/loadOptions';
import { getListColumns } from './methods/resourceMapping';
import { simplifyItem, simplifyItems } from './transport/simplify';

/** Type guard: rethrow already-structured n8n errors unchanged (matches CDOGSDocumentGenerator's guard). */
function isN8nError(error: unknown): error is NodeApiError | NodeOperationError {
  return error instanceof NodeApiError || error instanceof NodeOperationError;
}

interface BcGovSharePointCredentials {
  tenantId: string;
  clientId: string;
  graphBaseUrl: string;
  defaultSiteUrl: string;
  cacheTtlMinutes: number;
  maxRetries: number;
}

export { _resetCachesForTesting } from './transport/cache';

function parseSiteInput(raw: { mode: string; value?: string; hostname?: string; path?: string }): SiteInput {
  if (raw.mode === 'id') return { mode: 'id', value: String(raw.value) };
  if (raw.mode === 'hostPath') {
    const [hostname, ...pathParts] = String(raw.value ?? '').split('/');
    return { mode: 'hostPath', hostname, path: `/${pathParts.join('/')}` };
  }
  return { mode: 'url', value: String(raw.value) };
}

function parseListInput(raw: { mode: string; value?: string }): ListInput {
  if (raw.mode === 'id' || raw.mode === 'list') return { mode: 'id', value: String(raw.value) };
  return { mode: 'name', value: String(raw.value) };
}

function parseDriveInput(raw: { mode: string; value?: string }): DriveInput {
  if (raw.mode === 'id' || raw.mode === 'list') return { mode: 'id', value: String(raw.value) };
  if (raw.mode === 'name') return { mode: 'name', value: String(raw.value) };
  return { mode: 'default' };
}

function parseFieldsJson(this: IExecuteFunctions, itemIndex: number, paramName: string): IDataObject {
  const raw = this.getNodeParameter(paramName, itemIndex) as string | IDataObject;
  if (typeof raw !== 'string') return raw ?? {};
  try {
    return raw.trim() ? (JSON.parse(raw) as IDataObject) : {};
  } catch {
    throw new NodeOperationError(this.getNode(), `The "${paramName}" field contains invalid JSON.`, { itemIndex });
  }
}

export class BcGovSharePoint implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'BC Gov SharePoint',
    name: 'bcGovSharePoint',
    icon: { light: 'file:../../icons/sharepoint.svg', dark: 'file:../../icons/sharepoint.dark.svg' },
    group: ['transform'],
    version: 1,
    description:
      'Read and write SharePoint list items, files, and lists via Microsoft Graph under a Sites.Selected app-only grant',
    subtitle:
      '={{$parameter["resource"] + ": " + ($parameter["itemOperation"] || $parameter["userOperation"] || $parameter["fileOperation"] || $parameter["listOperation"])}}',
    usableAsTool: true,
    defaults: { name: 'BC Gov SharePoint' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: GRAPH_CREDENTIAL_TYPE, required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'File', value: 'file' },
          { name: 'Item', value: 'item' },
          { name: 'List', value: 'list' },
          { name: 'User', value: 'user' },
        ],
        default: 'item',
      },
      {
        displayName: 'Operation',
        name: 'itemOperation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['item'] } },
        options: [
          { name: 'Create', value: 'create', action: 'Create an item' },
          { name: 'Create or Update', value: 'createOrUpdate', action: 'Create or update an item' },
          { name: 'Delete', value: 'delete', action: 'Delete an item' },
          { name: 'Get', value: 'get', action: 'Get an item' },
          { name: 'Get Column Map', value: 'getColumnMap', action: 'Get the column display-name to internal-name map' },
          { name: 'Get Many', value: 'getMany', action: 'Get many items' },
          { name: 'Update', value: 'update', action: 'Update an item' },
        ],
        default: 'create',
      },
      {
        displayName: 'Operation',
        name: 'userOperation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['user'] } },
        options: [
          { name: 'Get Lookup ID', value: 'getLookupId', action: "Get a user's SharePoint lookup ID" },
          { name: 'Get Many', value: 'getMany', action: 'Get many users from the site' },
        ],
        default: 'getLookupId',
      },
      {
        displayName: 'Operation',
        name: 'fileOperation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['file'] } },
        options: [
          { name: 'Delete', value: 'delete', action: 'Delete a file' },
          { name: 'Download', value: 'download', action: 'Download a file' },
          { name: 'Get', value: 'get', action: 'Get file metadata' },
          { name: 'Get Many', value: 'getMany', action: 'List and search files' },
          { name: 'List Folder', value: 'listFolder', action: 'List files and folders' },
          { name: 'Update', value: 'update', action: "Update a file's metadata or content" },
          { name: 'Upload', value: 'upload', action: 'Upload a file' },
        ],
        default: 'download',
      },
      {
        displayName: 'Operation',
        name: 'listOperation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['list'] } },
        options: [
          { name: 'Get', value: 'get', action: 'Get a list' },
          { name: 'Get Many', value: 'getMany', action: 'Get many lists' },
        ],
        default: 'get',
      },
      {
        displayName: 'Site',
        name: 'site',
        type: 'resourceLocator',
        default: { mode: 'url', value: '' },
        description:
          "Leave blank to use the credential's Default Site URL. Sites.Selected cannot enumerate sites — pick a manual mode.",
        modes: [
          {
            displayName: 'By URL',
            name: 'url',
            type: 'string',
            placeholder: 'https://bcgov.sharepoint.com/sites/ENV-STB-TEST',
          },
          {
            displayName: 'By Host & Path',
            name: 'hostPath',
            type: 'string',
            placeholder: 'bcgov.sharepoint.com/sites/ENV-STB-TEST',
          },
          { displayName: 'By ID', name: 'id', type: 'string', placeholder: 'bcgov.sharepoint.com,coll-id,web-id' },
        ],
      },
      {
        displayName: 'List',
        name: 'list',
        type: 'resourceLocator',
        default: { mode: 'name', value: '' },
        required: true,
        displayOptions: { show: { resource: ['item'] } },
        modes: [
          {
            displayName: 'From List',
            name: 'list',
            type: 'list',
            typeOptions: { searchListMethod: 'searchLists', searchable: true },
          },
          { displayName: 'By Name', name: 'name', type: 'string', placeholder: 'Section24Referrals' },
          { displayName: 'By ID', name: 'id', type: 'string', placeholder: 'list-guid' },
        ],
      },
      {
        displayName: 'Document Library',
        name: 'drive',
        type: 'resourceLocator',
        default: { mode: 'default', value: '' },
        displayOptions: { show: { resource: ['file'] } },
        description: "Leave on Default to use the site's default document library",
        modes: [
          { displayName: 'Default', name: 'default', type: 'string', placeholder: '' },
          {
            displayName: 'From List',
            name: 'list',
            type: 'list',
            typeOptions: { searchListMethod: 'searchDrives', searchable: true },
          },
          { displayName: 'By Name', name: 'name', type: 'string', placeholder: 'Documents' },
          { displayName: 'By ID', name: 'id', type: 'string', placeholder: 'drive-guid' },
        ],
      },
      {
        displayName: 'Item ID',
        name: 'itemId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['file'], fileOperation: ['download', 'get', 'update', 'delete'] } },
        description: 'The Graph drive-item ID of the file',
      },
      {
        displayName: 'Output Data Field Name',
        name: 'outputBinaryPropertyName',
        type: 'string',
        default: 'data',
        displayOptions: { show: { resource: ['file'], fileOperation: ['download'] } },
      },
      {
        displayName: 'Input Data Field Name',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        required: true,
        displayOptions: { show: { resource: ['file'], fileOperation: ['upload'] } },
        description: 'Name of the binary property holding the file content to upload',
      },
      {
        displayName: 'Update Mode',
        name: 'updateMode',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['file'], fileOperation: ['update'] } },
        options: [
          { name: 'Replace Contents', value: 'replaceContents' },
          { name: 'Update Metadata', value: 'updateMetadata' },
          { name: 'Both', value: 'both' },
        ],
        default: 'updateMetadata',
      },
      {
        displayName: 'Input Data Field Name',
        name: 'updateBinaryPropertyName',
        type: 'string',
        default: 'data',
        displayOptions: {
          show: { resource: ['file'], fileOperation: ['update'], updateMode: ['replaceContents', 'both'] },
        },
      },
      {
        displayName: 'Metadata (JSON)',
        name: 'updateMetadataJson',
        type: 'json',
        default: '{}',
        displayOptions: {
          show: { resource: ['file'], fileOperation: ['update'], updateMode: ['updateMetadata', 'both'] },
        },
        description: 'Graph driveItem metadata fields to PATCH, e.g. {"name": "renamed.pdf"}',
      },
      {
        displayName: 'Folder Path',
        name: 'folderPath',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['file'], fileOperation: ['upload'] } },
        description: 'Server-relative folder path within the document library, e.g. Reports/2026',
      },
      {
        displayName: 'File Name',
        name: 'uploadFileName',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['file'], fileOperation: ['upload'] } },
      },
      {
        displayName: 'Conflict Behaviour',
        name: 'conflictBehavior',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['file'], fileOperation: ['upload'] } },
        options: [
          { name: 'Fail', value: 'fail' },
          { name: 'Replace', value: 'replace' },
          { name: 'Rename', value: 'rename' },
        ],
        default: 'fail',
      },
      {
        displayName: 'Create Parent Folders',
        name: 'createParentFolders',
        type: 'boolean',
        default: true,
        displayOptions: { show: { resource: ['file'], fileOperation: ['upload'] } },
      },
      {
        displayName: 'Chunk Size (MiB)',
        name: 'chunkSizeMiB',
        type: 'number',
        default: 5,
        displayOptions: { show: { resource: ['file'], fileOperation: ['upload'] } },
        description: 'Must be a multiple of 0.3125 MiB (320 KiB); only used above the 4 MiB simple-upload threshold',
      },
      {
        displayName: 'Folder Path',
        name: 'fileFolderPath',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['file'], fileOperation: ['listFolder', 'getMany'] } },
        description:
          'Folder path within the document library to list, e.g. Reports/2026. Leave empty for the library root.',
      },
      {
        displayName: 'Name Filter',
        name: 'fileNameFilter',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['file'], fileOperation: ['getMany'] } },
        description: 'Filter files by name (case-insensitive contains match). Leave empty to return all files.',
      },
      {
        displayName: 'Return All',
        name: 'fileReturnAll',
        type: 'boolean',
        default: false,
        displayOptions: { show: { resource: ['file'], fileOperation: ['listFolder', 'getMany'] } },
      },
      {
        displayName: 'Limit',
        name: 'fileLimit',
        type: 'number',
        default: 50,
        displayOptions: {
          show: { resource: ['file'], fileOperation: ['listFolder', 'getMany'], fileReturnAll: [false] },
        },
      },
      {
        displayName: 'Include Columns',
        name: 'includeColumns',
        type: 'boolean',
        default: false,
        displayOptions: { show: { resource: ['list'], listOperation: ['get', 'getMany'] } },
        description: 'Whether to attach the resolved display-name -> internal-name column map to each list',
      },
      {
        displayName: 'List',
        name: 'listResourceId',
        type: 'resourceLocator',
        default: { mode: 'name', value: '' },
        required: true,
        displayOptions: { show: { resource: ['list'], listOperation: ['get'] } },
        modes: [
          {
            displayName: 'From List',
            name: 'list',
            type: 'list',
            typeOptions: { searchListMethod: 'searchLists', searchable: true },
          },
          { displayName: 'By Name', name: 'name', type: 'string', placeholder: 'Section24Referrals' },
          { displayName: 'By ID', name: 'id', type: 'string', placeholder: 'list-guid' },
        ],
      },
      {
        displayName: 'Include Hidden Lists',
        name: 'includeHiddenLists',
        type: 'boolean',
        default: false,
        displayOptions: { show: { resource: ['list'], listOperation: ['getMany'] } },
      },
      {
        displayName: 'Return All',
        name: 'listReturnAll',
        type: 'boolean',
        default: false,
        displayOptions: { show: { resource: ['list'], listOperation: ['getMany'] } },
      },
      {
        displayName: 'Limit',
        name: 'listLimit',
        type: 'number',
        default: 50,
        displayOptions: { show: { resource: ['list'], listOperation: ['getMany'], listReturnAll: [false] } },
      },
      {
        displayName: 'Field Input Mode',
        name: 'fieldInputMode',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['item'], itemOperation: ['create', 'update', 'createOrUpdate'] } },
        options: [
          {
            name: 'Pick Fields',
            value: 'fields',
            description: 'Select columns from a dropdown and fill values one by one',
          },
          {
            name: 'Use JSON',
            value: 'json',
            description: 'Paste or construct a JSON object keyed by column display name or internal name',
          },
        ],
        default: 'fields',
      },
      {
        displayName: 'Fields',
        name: 'fieldEntries',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true, multipleValueButtonText: 'Add Column' },
        default: {},
        displayOptions: {
          show: {
            resource: ['item'],
            itemOperation: ['create', 'update', 'createOrUpdate'],
            fieldInputMode: ['fields'],
          },
        },
        description: 'Add fields one by one — select the column name from the dropdown',
        options: [
          {
            displayName: 'Field',
            name: 'field',
            values: [
              {
                displayName: 'Column',
                name: 'column',
                type: 'options',
                typeOptions: { loadOptionsMethod: 'getColumnNames', loadOptionsDependsOn: ['site', 'list'] },
                default: '',
                description: 'The column to write to (display name)',
              },
              {
                displayName: 'Value',
                name: 'value',
                type: 'string',
                default: '',
                description:
                  'The value to write — person fields accept an email, dates accept ISO 8601, and multi-value columns (multi-choice, multi-person, multi-lookup) accept a comma-separated list such as A,B or an array such as {{ ["A","B"] }}',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Fields (JSON)',
        name: 'fieldsJson',
        type: 'json',
        default: '{}',
        displayOptions: {
          show: { resource: ['item'], itemOperation: ['create', 'update', 'createOrUpdate'], fieldInputMode: ['json'] },
        },
        description:
          'Object keyed by display name or internal name — coerced against the list schema. Use the "Get Column Map" operation to see available columns.',
        typeOptions: {
          alwaysOpenEditWindow: true,
        },
      },
      {
        displayName: 'Match Fields (JSON)',
        name: 'matchFieldsJson',
        type: 'json',
        default: '{}',
        displayOptions: { show: { resource: ['item'], itemOperation: ['createOrUpdate'] } },
        description: 'Object of field:value pairs AND-composed into the match filter',
      },
      {
        displayName: 'Item ID',
        name: 'itemId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['item'], itemOperation: ['get', 'update', 'delete'] } },
      },
      {
        displayName: 'Filter Type',
        name: 'filterMode',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['item'], itemOperation: ['getMany'] } },
        options: [
          { name: 'None', value: 'none' },
          { name: 'Simple', value: 'simple' },
          { name: 'OData', value: 'odata' },
        ],
        default: 'none',
      },
      {
        displayName: 'Conditions',
        name: 'simpleConditions',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        default: {},
        displayOptions: { show: { resource: ['item'], itemOperation: ['getMany'], filterMode: ['simple'] } },
        options: [
          {
            displayName: 'Condition',
            name: 'condition',
            values: [
              { displayName: 'Column', name: 'column', type: 'string', default: '' },
              {
                displayName: 'Operator',
                name: 'operator',
                type: 'options',
                options: [
                  { name: 'Equals', value: 'eq' },
                  { name: 'Not Equals', value: 'ne' },
                  { name: 'Greater Than', value: 'gt' },
                  { name: 'Greater Or Equal', value: 'ge' },
                  { name: 'Less Than', value: 'lt' },
                  { name: 'Less Or Equal', value: 'le' },
                  { name: 'Starts With', value: 'startswith' },
                  { name: 'Contains', value: 'contains' },
                ],
                default: 'eq',
              },
              { displayName: 'Value', name: 'value', type: 'string', default: '' },
            ],
          },
        ],
      },
      {
        displayName: 'OData Filter',
        name: 'odataFilter',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['item'], itemOperation: ['getMany'], filterMode: ['odata'] } },
      },
      {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: false,
        displayOptions: { show: { resource: ['item'], itemOperation: ['getMany'] } },
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 50,
        displayOptions: { show: { resource: ['item'], itemOperation: ['getMany'], returnAll: [false] } },
      },
      {
        displayName: 'Refresh Metadata Cache',
        name: 'refreshCache',
        type: 'boolean',
        default: false,
        description: 'Whether to bypass and repopulate the cached site/list/column metadata for this call',
      },
      {
        displayName: 'Simplify',
        name: 'simplify',
        type: 'boolean',
        default: true,
        displayOptions: { show: { resource: ['item'], itemOperation: ['get', 'getMany'] } },
        description:
          'Whether to flatten the fields object and re-key internal column names to display names for easier downstream use',
      },
      {
        displayName: 'Email',
        name: 'email',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['user'], userOperation: ['getLookupId'] } },
      },
      {
        displayName: 'On Not Found',
        name: 'onNotFound',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['user'], userOperation: ['getLookupId'] } },
        options: [
          { name: 'Error', value: 'error' },
          { name: 'Continue (Null)', value: 'continue' },
          {
            name: 'Ensure User',
            value: 'ensureUser',
            description:
              'Provision the user on the site via SharePoint REST. Requires Sites.Selected on both Graph and SharePoint resources.',
          },
        ],
        default: 'error',
      },
      {
        displayName: 'Exclude System Accounts',
        name: 'excludeSystemAccounts',
        type: 'boolean',
        default: true,
        displayOptions: { show: { resource: ['user'], userOperation: ['getMany'] } },
        description: 'Whether to filter out system and group principals, keeping only Person entries',
      },
      {
        displayName: 'Return All',
        name: 'userReturnAll',
        type: 'boolean',
        default: false,
        displayOptions: { show: { resource: ['user'], userOperation: ['getMany'] } },
      },
      {
        displayName: 'Limit',
        name: 'userLimit',
        type: 'number',
        default: 50,
        displayOptions: { show: { resource: ['user'], userOperation: ['getMany'], userReturnAll: [false] } },
      },
    ],
  };

  methods = {
    listSearch: { searchLists, searchDrives },
    loadOptions: { getColumnNames },
    resourceMapping: { getListColumns },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = (await this.getCredentials(GRAPH_CREDENTIAL_TYPE)) as unknown as BcGovSharePointCredentials;
    const credentialId = `${credentials.tenantId}:${credentials.clientId}`;
    const retry: RetryOptions = { maxRetries: credentials.maxRetries };
    const context: GraphContext & BinaryRequestContext = {
      helpers: {
        httpRequestWithAuthentication: (credentialType, options) =>
          this.helpers.httpRequestWithAuthentication.call(this, credentialType, options),
        requestOAuth2: (credentialType, options, additionalOAuth2Options) =>
          // eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions -- matches transport/graphRequest.ts's graphBinaryRequest: httpRequestWithAuthentication does not reliably handle binary bodies/responses as of n8n 2.x.
          this.helpers.requestOAuth2.call(this, credentialType, options, additionalOAuth2Options) as Promise<{
            body: Buffer;
            headers: IDataObject;
          }>,
      },
      getNode: () => this.getNode(),
    };

    // Per-execution memoisation (spec section 9): the cache/resolver lookup runs
    // once per execute() call, shared across all input items, regardless of the
    // credential's TTL setting — not once per item.
    const refreshCache = this.getNodeParameter('refreshCache', 0) as boolean;
    const cache = getCacheForCredential(credentialId, credentials.cacheTtlMinutes, refreshCache);
    const resolvers = createCachedResolvers(context, credentials.graphBaseUrl, retry, cache, credentialId);

    for (const [itemIndex] of items.entries()) {
      try {
        const result = await executeItem.call(this, context, credentials, retry, resolvers, itemIndex);
        returnData.push(...result);
      } catch (error) {
        if (!this.continueOnFail()) {
          if (isN8nError(error)) throw error;
          throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
        }
        returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: itemIndex } });
      }
    }

    return [returnData];
  }
}

async function executeItem(
  this: IExecuteFunctions,
  context: GraphContext & BinaryRequestContext,
  credentials: BcGovSharePointCredentials,
  retry: RetryOptions,
  resolvers: ReturnType<typeof createCachedResolvers>,
  itemIndex: number,
): Promise<INodeExecutionData[]> {
  const resource = this.getNodeParameter('resource', itemIndex) as string;
  const baseUrl = credentials.graphBaseUrl;

  const siteRaw = this.getNodeParameter('site', itemIndex) as { mode: string; value?: string };
  const siteValue = siteRaw.value?.trim() ? siteRaw : { mode: 'url', value: credentials.defaultSiteUrl };
  const resolvedSite = await resolvers.resolveSiteId(parseSiteInput(siteValue));
  const siteId = resolvedSite.siteId;

  if (resource === 'file') {
    return executeFileOperation.call(this, context, baseUrl, retry, resolvers, siteId, itemIndex);
  }
  if (resource === 'list') {
    return executeListOperation.call(this, context, baseUrl, retry, resolvers, siteId, itemIndex);
  }
  if (resource === 'user') {
    return executeUserOperation.call(
      this,
      context,
      baseUrl,
      retry,
      siteId,
      itemIndex,
      resolvedSite,
      siteValue,
      credentials,
    );
  }
  return executeItemOperation.call(this, context, baseUrl, retry, resolvers, siteId, itemIndex);
}

async function executeFileOperation(
  this: IExecuteFunctions,
  context: GraphContext & BinaryRequestContext,
  baseUrl: string,
  retry: RetryOptions,
  resolvers: ReturnType<typeof createCachedResolvers>,
  siteId: string,
  itemIndex: number,
): Promise<INodeExecutionData[]> {
  const driveRaw = this.getNodeParameter('drive', itemIndex) as { mode: string; value?: string };
  const driveId = await resolvers.resolveDriveId(siteId, parseDriveInput(driveRaw));
  const operation = this.getNodeParameter('fileOperation', itemIndex) as string;

  if (operation === 'download') {
    const itemId = this.getNodeParameter('itemId', itemIndex) as string;
    const outputField = this.getNodeParameter('outputBinaryPropertyName', itemIndex) as string;
    const { buffer, fileName, mimeType } = await downloadFile(context, baseUrl, retry, siteId, driveId, itemId);
    const binary = await this.helpers.prepareBinaryData(buffer, fileName, mimeType);
    return this.helpers.constructExecutionMetaData(
      [{ json: { fileName, mimeType }, binary: { [outputField]: binary } }],
      { itemData: { item: itemIndex } },
    );
  }

  if (operation === 'upload') {
    const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
    const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
    const folderPath = this.getNodeParameter('folderPath', itemIndex) as string;
    const fileName = this.getNodeParameter('uploadFileName', itemIndex) as string;
    const conflictBehavior = this.getNodeParameter(
      'conflictBehavior',
      itemIndex,
    ) as UploadFileOptions['conflictBehavior'];
    const createParentFolders = this.getNodeParameter('createParentFolders', itemIndex) as boolean;
    const chunkSizeMiB = this.getNodeParameter('chunkSizeMiB', itemIndex) as number;
    const result = await uploadFile(context, baseUrl, retry, { siteId, driveId, folderPath, fileName }, buffer, {
      conflictBehavior,
      chunkSizeBytes: Math.round(chunkSizeMiB * 1024 * 1024),
      createParentFolders,
    });
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
      itemData: { item: itemIndex },
    });
  }

  if (operation === 'get') {
    const itemId = this.getNodeParameter('itemId', itemIndex) as string;
    const result = await getFile(context, baseUrl, retry, siteId, driveId, itemId);
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
      itemData: { item: itemIndex },
    });
  }

  if (operation === 'getMany') {
    const folderPath = this.getNodeParameter('fileFolderPath', itemIndex) as string;
    const nameFilter = this.getNodeParameter('fileNameFilter', itemIndex, '') as string;
    const returnAll = this.getNodeParameter('fileReturnAll', itemIndex) as boolean;
    const limit = returnAll ? undefined : (this.getNodeParameter('fileLimit', itemIndex) as number);
    const result = await getManyFiles(context, baseUrl, retry, siteId, driveId, {
      folderPath,
      nameFilter: nameFilter || undefined,
      returnAll,
      limit,
    });
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
      itemData: { item: itemIndex },
    });
  }

  if (operation === 'listFolder') {
    const folderPath = this.getNodeParameter('fileFolderPath', itemIndex) as string;
    const returnAll = this.getNodeParameter('fileReturnAll', itemIndex) as boolean;
    const limit = returnAll ? undefined : (this.getNodeParameter('fileLimit', itemIndex) as number);
    const result = await listFolder(context, baseUrl, retry, siteId, driveId, { folderPath, returnAll, limit });
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
      itemData: { item: itemIndex },
    });
  }

  if (operation === 'delete') {
    const itemId = this.getNodeParameter('itemId', itemIndex) as string;
    const result = await deleteFile(context, baseUrl, retry, siteId, driveId, itemId);
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
      itemData: { item: itemIndex },
    });
  }

  // operation === 'update'
  const itemId = this.getNodeParameter('itemId', itemIndex) as string;
  const updateMode = this.getNodeParameter('updateMode', itemIndex) as UpdateFileOptions['mode'];
  const updateOptions: UpdateFileOptions = { mode: updateMode };
  if (updateMode === 'updateMetadata' || updateMode === 'both') {
    updateOptions.metadata = parseFieldsJson.call(this, itemIndex, 'updateMetadataJson');
  }
  if (updateMode === 'replaceContents' || updateMode === 'both') {
    const updateBinaryPropertyName = this.getNodeParameter('updateBinaryPropertyName', itemIndex) as string;
    updateOptions.newContent = await this.helpers.getBinaryDataBuffer(itemIndex, updateBinaryPropertyName);
  }
  const result = await updateFile(context, baseUrl, retry, siteId, driveId, itemId, updateOptions);
  return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
    itemData: { item: itemIndex },
  });
}

async function executeListOperation(
  this: IExecuteFunctions,
  context: GraphContext & BinaryRequestContext,
  baseUrl: string,
  retry: RetryOptions,
  resolvers: ReturnType<typeof createCachedResolvers>,
  siteId: string,
  itemIndex: number,
): Promise<INodeExecutionData[]> {
  const operation = this.getNodeParameter('listOperation', itemIndex) as string;
  const includeColumns = this.getNodeParameter('includeColumns', itemIndex) as boolean;

  if (operation === 'get') {
    const listRaw = this.getNodeParameter('listResourceId', itemIndex) as { mode: string; value?: string };
    const listId = await resolvers.resolveListId(siteId, parseListInput(listRaw));
    const columnMap = includeColumns ? await resolvers.getColumnMap(siteId, listId) : undefined;
    const result = await getList(context, baseUrl, retry, siteId, listId, columnMap);
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
      itemData: { item: itemIndex },
    });
  }

  // operation === 'getMany'
  const includeHiddenLists = this.getNodeParameter('includeHiddenLists', itemIndex) as boolean;
  const returnAll = this.getNodeParameter('listReturnAll', itemIndex) as boolean;
  const limit = returnAll ? undefined : (this.getNodeParameter('listLimit', itemIndex) as number);
  const result = await getManyLists(
    context,
    baseUrl,
    retry,
    siteId,
    { includeHiddenLists, returnAll, limit },
    includeColumns ? (listId: string) => resolvers.getColumnMap(siteId, listId) : undefined,
  );
  return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
    itemData: { item: itemIndex },
  });
}

interface UserOperationContext {
  resolvedSite: { hostname: string; siteId: string; siteCollectionId: string; webId: string };
  siteValue: { mode: string; value?: string };
  credentials: BcGovSharePointCredentials;
}

async function executeUserOperation(
  this: IExecuteFunctions,
  context: GraphContext & BinaryRequestContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  itemIndex: number,
  resolvedSite: UserOperationContext['resolvedSite'],
  siteValue: UserOperationContext['siteValue'],
  credentials: BcGovSharePointCredentials,
): Promise<INodeExecutionData[]> {
  const operation = this.getNodeParameter('userOperation', itemIndex) as string;

  if (operation === 'getLookupId') {
    const email = this.getNodeParameter('email', itemIndex) as string;
    const onNotFound = this.getNodeParameter('onNotFound', itemIndex) as 'error' | 'continue' | 'ensureUser';
    const siteInfo = resolveEnsureUserSiteInfo(resolvedSite, siteValue, credentials, onNotFound);
    const result = await getUserLookupId(context, baseUrl, retry, siteId, email, onNotFound, siteInfo);
    return this.helpers.constructExecutionMetaData(
      this.helpers.returnJsonArray((result ?? { email, lookupId: null }) as IDataObject),
      { itemData: { item: itemIndex } },
    );
  }

  if (operation === 'getMany') {
    const excludeSystemAccounts = this.getNodeParameter('excludeSystemAccounts', itemIndex) as boolean;
    const returnAll = this.getNodeParameter('userReturnAll', itemIndex) as boolean;
    const limit = returnAll ? undefined : (this.getNodeParameter('userLimit', itemIndex) as number);
    const result = await getManyUsers(context, baseUrl, retry, siteId, { excludeSystemAccounts, returnAll, limit });
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
      itemData: { item: itemIndex },
    });
  }

  throw new NodeOperationError(this.getNode(), `Unknown user operation "${operation}"`, { itemIndex });
}

function resolveEnsureUserSiteInfo(
  resolvedSite: { hostname: string },
  siteValue: { mode: string; value?: string },
  credentials: BcGovSharePointCredentials,
  onNotFound: string,
): { hostname: string; path: string } | undefined {
  if (onNotFound !== 'ensureUser') return undefined;

  const siteHostname = resolvedSite.hostname;
  let sitePath: string | undefined;

  const parsedInput = parseSiteInput(siteValue);
  if (parsedInput.mode === 'url') {
    try {
      const parsed = new URL(parsedInput.value);
      sitePath = parsed.pathname.replace(/\/$/, '');
    } catch {
      // Fall through
    }
  } else if (parsedInput.mode === 'hostPath') {
    sitePath = parsedInput.path;
  } else {
    try {
      const parsed = new URL(credentials.defaultSiteUrl);
      if (parsed.hostname === siteHostname) {
        sitePath = parsed.pathname.replace(/\/$/, '');
      }
    } catch {
      // sitePath stays undefined
    }
  }

  return sitePath ? { hostname: siteHostname, path: sitePath } : undefined;
}

async function executeItemOperation(
  this: IExecuteFunctions,
  context: GraphContext & BinaryRequestContext,
  baseUrl: string,
  retry: RetryOptions,
  resolvers: ReturnType<typeof createCachedResolvers>,
  siteId: string,
  itemIndex: number,
): Promise<INodeExecutionData[]> {
  const operation = this.getNodeParameter('itemOperation', itemIndex) as string;
  const listRaw = this.getNodeParameter('list', itemIndex) as { mode: string; value?: string };
  const listId = await resolvers.resolveListId(siteId, parseListInput(listRaw));

  if (operation === 'getColumnMap') {
    const columnMap = await resolvers.getColumnMap(siteId, listId);
    const map: IDataObject = {};
    for (const [, entry] of columnMap.byDisplayName.entries()) {
      map[entry.displayName] = entry.internalName;
    }
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray({ columnMap: map } as IDataObject), {
      itemData: { item: itemIndex },
    });
  }

  if (operation === 'delete') {
    const itemId = this.getNodeParameter('itemId', itemIndex) as string;
    const result = await deleteItem(context, baseUrl, retry, siteId, listId, itemId);
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
      itemData: { item: itemIndex },
    });
  }

  if (operation === 'get') {
    const itemId = this.getNodeParameter('itemId', itemIndex) as string;
    const result = await getItem(context, baseUrl, retry, siteId, listId, itemId);
    const simplify = this.getNodeParameter('simplify', itemIndex) as boolean;
    const output = simplify ? simplifyItem(result, await resolvers.getColumnMap(siteId, listId)) : result;
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(output), {
      itemData: { item: itemIndex },
    });
  }

  if (operation === 'getMany') {
    const columnMap = await resolvers.getColumnMap(siteId, listId);
    const filterMode = this.getNodeParameter('filterMode', itemIndex) as 'none' | 'simple' | 'odata';
    const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
    const limit = returnAll ? undefined : (this.getNodeParameter('limit', itemIndex) as number);
    const simpleConditionsRaw = (
      this.getNodeParameter('simpleConditions', itemIndex, {}) as { condition?: SimpleFilterCondition[] }
    ).condition;
    const odataFilter = this.getNodeParameter('odataFilter', itemIndex, '') as string;
    const result = await getManyItems(context, baseUrl, retry, siteId, listId, columnMap, {
      filterMode,
      simpleConditions: simpleConditionsRaw,
      odataFilter,
      returnAll,
      limit,
    });
    const simplify = this.getNodeParameter('simplify', itemIndex) as boolean;
    const output = simplify ? simplifyItems(result, columnMap) : result;
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(output), {
      itemData: { item: itemIndex },
    });
  }

  const columnMap = await resolvers.getColumnMap(siteId, listId);
  const rawFields = readFieldsFromInput.call(this, itemIndex);

  if (operation === 'create') {
    const result = await createItem(context, baseUrl, retry, siteId, listId, columnMap, rawFields);
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
      itemData: { item: itemIndex },
    });
  }

  if (operation === 'update') {
    const itemId = this.getNodeParameter('itemId', itemIndex) as string;
    const result = await updateItem(context, baseUrl, retry, { siteId, listId, itemId }, columnMap, rawFields);
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
      itemData: { item: itemIndex },
    });
  }

  if (operation === 'createOrUpdate') {
    const matchFields = parseFieldsJson.call(this, itemIndex, 'matchFieldsJson');
    const result = await createOrUpdateItem(
      context,
      baseUrl,
      retry,
      { siteId, listId },
      columnMap,
      rawFields,
      matchFields,
    );
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
      itemData: { item: itemIndex },
    });
  }

  throw new NodeOperationError(this.getNode(), `Unknown item operation "${operation}"`, { itemIndex });
}

/**
 * Normalize a per-column "Fields" value. The value input is a `json`-typed
 * fixedCollection field, so n8n may hand back either an already-parsed value
 * (array/object/number/boolean from an expression) or a raw string. A string
 * that parses as a JSON array or object is re-hydrated so multi-value columns
 * (multi-choice/person/lookup) receive a real array; any other string is left
 * untouched so scalar text/choice values pass through verbatim.
 */
function normalizeFieldValue(value: GenericValue): GenericValue {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!(trimmed.startsWith('[') || trimmed.startsWith('{'))) return value;
  try {
    return JSON.parse(trimmed) as GenericValue;
  } catch {
    return value;
  }
}

function readFieldsFromInput(this: IExecuteFunctions, itemIndex: number): IDataObject {
  const fieldInputMode = this.getNodeParameter('fieldInputMode', itemIndex) as 'json' | 'fields';
  if (fieldInputMode === 'fields') {
    const entries =
      (
        this.getNodeParameter('fieldEntries', itemIndex, {}) as {
          field?: Array<{ column: string; value: GenericValue }>;
        }
      ).field ?? [];
    const rawFields: IDataObject = {};
    for (const entry of entries) {
      if (entry.column) {
        rawFields[entry.column] = normalizeFieldValue(entry.value);
      }
    }
    return rawFields;
  }
  return parseFieldsJson.call(this, itemIndex, 'fieldsJson');
}
