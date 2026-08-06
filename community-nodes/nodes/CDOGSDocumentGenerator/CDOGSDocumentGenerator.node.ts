import {
  NodeConnectionTypes,
  NodeApiError,
  NodeOperationError,
  type IExecuteFunctions,
  type IBinaryData,
  type ILoadOptionsFunctions,
  type INodeExecutionData,
  type IDataObject,
  type INodePropertyOptions,
  type JsonObject,
  type INodeType,
  type INodeTypeDescription,
} from 'n8n-workflow';
import { cdogsApiRequest, cdogsApiBinaryResponse, cdogsApiUploadTemplate } from './shared/GenericFunctions';
import { CDOGS_OAUTH2_CREDENTIAL } from './shared/constants';

/**
 * Type guard: returns true when the error is already a structured n8n error
 * (NodeApiError or NodeOperationError) and should be rethrown as-is.
 */
function isN8nError(error: unknown): error is NodeApiError | NodeOperationError {
  return error instanceof NodeApiError || error instanceof NodeOperationError;
}

const TEXT_TEMPLATE_FORMAT_OPTIONS = [
  { name: 'HTML', value: 'html' },
  { name: 'TXT', value: 'txt' },
] as const;

export class CDOGSDocumentGenerator implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'CDOGS',
    name: 'cdogs',
    icon: { light: 'file:../../icons/document-generate.svg', dark: 'file:../../icons/document-generate.dark.svg' },
    group: ['transform'],
    version: 1,
    description:
      'Interact with the Common Document Generation Service (CDOGS) API to generate documents from templates',
    subtitle: '={{$parameter["operation"]}}',
    usableAsTool: true,
    defaults: { name: 'CDOGS' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: CDOGS_OAUTH2_CREDENTIAL,
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Base URL',
        name: 'baseUrl',
        type: 'string',
        default: 'https://cdogs-dev.api.gov.bc.ca/api/v2',
        required: true,
        description: 'The CDOGS API v2 URL; its environment must match the OAuth2 credential token endpoint',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Check Template Exists',
            value: 'checkTemplate',
            action: 'Check if a template exists in CDOGS',
            description: 'Check if a template with the given hash exists',
          },
          {
            name: 'Generate from Existing Template',
            value: 'generateFromExisting',
            action: 'Generate a document from an existing template',
            description: 'Render a document using a previously uploaded template hash',
          },
          {
            name: 'Generate from Inline Template',
            value: 'generateFromInline',
            action: 'Generate a document from an inline template',
            description: 'Render a document by supplying the template content inline',
          },
          {
            name: 'Health Check',
            value: 'healthCheck',
            action: 'Check the health status of the CDOGS API',
            description: 'Check the health status of the CDOGS API',
          },
          {
            name: 'Remove Template',
            value: 'removeTemplate',
            action: 'Remove a template from CDOGS',
            description: 'Delete a previously uploaded template by its hash',
          },
          {
            name: 'Upload Template',
            value: 'uploadTemplate',
            action: 'Upload a template file to CDOGS',
            description: 'Upload a template file and receive a template hash',
          },
        ],
        default: 'healthCheck',
        description: 'The operation to perform',
      },
      // --- Upload Template fields ---
      {
        displayName: 'Input Data Field Name',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        required: true,
        displayOptions: {
          show: {
            operation: ['uploadTemplate'],
          },
        },
        description:
          "Specify the property name of the binary data in the input item or use an expression to access the binary data in previous nodes, e.g. {{ $('Target Node').item.binary.data }}",
      },
      // --- Check Template / Remove Template fields ---
      {
        displayName: 'Template Hash',
        name: 'templateHash',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            operation: ['checkTemplate', 'removeTemplate', 'generateFromExisting'],
          },
        },
        description: 'The hash (uid) of the previously uploaded template',
      },
      // --- Generate from Existing Template fields ---
      {
        displayName: 'Template Data (JSON)',
        name: 'data',
        type: 'json',
        default: '{}',
        required: true,
        displayOptions: {
          show: {
            operation: ['generateFromExisting', 'generateFromInline'],
          },
        },
        description: 'Template variables as JSON text or an expression resolving to an object or array of objects',
      },
      {
        displayName: 'Enable Custom Formatters',
        name: 'enableFormatters',
        type: 'boolean',
        default: false,
        displayOptions: {
          show: {
            operation: ['generateFromExisting', 'generateFromInline'],
          },
        },
        description: 'Whether to send a TeleJSON custom formatter map to CDOGS',
      },
      {
        displayName: 'Custom Formatters (JSON)',
        name: 'formatters',
        type: 'json',
        typeOptions: {
          rows: 6,
        },
        default: '{}',
        required: true,
        displayOptions: {
          show: {
            operation: ['generateFromExisting', 'generateFromInline'],
            enableFormatters: [true],
          },
        },
        description:
          'TeleJSON formatter map sent as the CDOGS formatters string; functions are passed to CDOGS and are not executed by n8n',
      },
      {
        displayName: 'Convert To',
        name: 'convertTo',
        type: 'options',
        typeOptions: {
          loadOptionsMethod: 'getConvertToOptions',
          loadOptionsDependsOn: ['baseUrl', 'templateSource', 'contentFileType'],
        },
        default: 'pdf',
        displayOptions: {
          show: {
            operation: ['generateFromExisting', 'generateFromInline'],
          },
        },
        description: 'The output format to convert the rendered document to',
      },
      {
        displayName: 'Report Name',
        name: 'reportName',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            operation: ['generateFromExisting', 'generateFromInline'],
          },
        },
        description: 'Optional output filename for the generated document (without extension)',
      },
      {
        displayName: 'Overwrite Cached Template',
        name: 'overwrite',
        type: 'boolean',
        default: true,
        displayOptions: {
          show: {
            operation: ['generateFromInline'],
          },
        },
        description: 'Whether CDOGS may replace an identical template already stored in its cache',
      },
      // --- Generate from Inline Template fields ---
      {
        displayName: 'Template Source',
        name: 'templateSource',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Binary Input',
            value: 'binary',
            description: 'Read the template from a binary input field',
          },
          {
            name: 'Text Content',
            value: 'text',
            description: 'Provide template content as a text string (e.g. HTML)',
          },
        ],
        default: 'binary',
        displayOptions: {
          show: {
            operation: ['generateFromInline'],
          },
        },
        description: 'Where to source the template content from',
      },
      {
        displayName: 'Template Input Data Field Name',
        name: 'templateBinaryPropertyName',
        type: 'string',
        default: 'template',
        required: true,
        displayOptions: {
          show: {
            operation: ['generateFromInline'],
            templateSource: ['binary'],
          },
        },
        description:
          "Specify the property name of the binary data in the input item or use an expression to access the binary data in previous nodes, e.g. {{ $('Target Node').item.binary.data }}",
      },
      {
        displayName: 'Template Content',
        name: 'templateContent',
        type: 'string',
        typeOptions: {
          rows: 6,
        },
        default: '',
        required: true,
        displayOptions: {
          show: {
            operation: ['generateFromInline'],
            templateSource: ['text'],
          },
        },
        description: 'The text content of the template (e.g. HTML with template variables)',
      },
      {
        displayName: 'Content File Type',
        name: 'contentFileType',
        type: 'options',
        options: [...TEXT_TEMPLATE_FORMAT_OPTIONS],
        default: 'html',
        displayOptions: {
          show: {
            operation: ['generateFromInline'],
            templateSource: ['text'],
          },
        },
        description: 'The file type of the inline text template content',
      },
      // --- Output binary field name ---
      {
        displayName: 'Output Data Field Name',
        name: 'outputBinaryPropertyName',
        type: 'string',
        default: 'data',
        displayOptions: {
          show: {
            operation: ['generateFromExisting', 'generateFromInline'],
          },
        },
        description: 'The name of the output binary field to store the generated document',
      },
    ],
  };

  methods = {
    loadOptions: {
      getConvertToOptions,
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const operation = this.getNodeParameter('operation', 0) as string;
    const returnData: INodeExecutionData[] = [];

    for (const [itemIndex] of items.entries()) {
      try {
        const result = await executeOperation.call(this, operation, itemIndex);
        returnData.push(...result);
      } catch (error) {
        if (!this.continueOnFail()) {
          // Rethrow already-structured n8n errors unchanged to avoid double-wrapping.
          if (isN8nError(error)) {
            throw error;
          }
          throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
        }
        returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: itemIndex } });
      }
    }

    return [returnData];
  }
}

/**
 * Dispatch to the correct operation handler.
 */
async function executeOperation(
  this: IExecuteFunctions,
  operation: string,
  itemIndex: number,
): Promise<INodeExecutionData[]> {
  if (operation === 'healthCheck') {
    const response = await cdogsApiRequest.call(this, 'GET', '/health');
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(response), {
      itemData: { item: itemIndex },
    });
  }
  if (operation === 'uploadTemplate') {
    return executeUploadTemplate.call(this, itemIndex);
  }
  if (operation === 'checkTemplate') {
    const templateHash = this.getNodeParameter('templateHash', itemIndex) as string;
    try {
      const response = await cdogsApiRequest.call(this, 'GET', `/template/${encodeURIComponent(templateHash)}`);
      return this.helpers.constructExecutionMetaData(
        this.helpers.returnJsonArray({ exists: true, hash: templateHash, template: response }),
        { itemData: { item: itemIndex } },
      );
    } catch (error) {
      const statusCode = getCheckTemplateErrorStatus(error);
      if (statusCode === 404) {
        return this.helpers.constructExecutionMetaData(
          this.helpers.returnJsonArray({ exists: false, hash: templateHash }),
          { itemData: { item: itemIndex } },
        );
      }
      // Unexpected errors (401, 403, 500, network) should still fail the node.
      throw error;
    }
  }
  if (operation === 'removeTemplate') {
    const templateHash = this.getNodeParameter('templateHash', itemIndex) as string;
    await cdogsApiRequest.call(this, 'DELETE', `/template/${encodeURIComponent(templateHash)}`);
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray({ deleted: true }), {
      itemData: { item: itemIndex },
    });
  }
  if (operation === 'generateFromExisting') {
    return executeGenerateFromExisting.call(this, itemIndex);
  }
  return executeGenerateFromInline.call(this, itemIndex);
}

/**
 * Upload a template binary to CDOGS and return the template hash.
 */
async function executeUploadTemplate(this: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData[]> {
  const binaryInput = this.getNodeParameter('binaryPropertyName', itemIndex) as string | IBinaryData;
  const binaryData = this.helpers.assertBinaryData(itemIndex, binaryInput);
  const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryInput);
  const result = await cdogsApiUploadTemplate.call(
    this,
    buffer,
    binaryData.fileName || 'template',
    binaryData.mimeType || 'application/octet-stream',
  );
  if (!result.hash) {
    throw new NodeOperationError(this.getNode(), 'CDOGS did not return a template hash', { itemIndex });
  }

  return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
    itemData: { item: itemIndex },
  });
}

/**
 * Generate a document from a previously uploaded template.
 */
async function executeGenerateFromExisting(this: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData[]> {
  const templateHash = this.getNodeParameter('templateHash', itemIndex) as string;
  const { parsedData, formatters, convertTo, reportName, outputField } = parseRenderParams.call(this, itemIndex);

  const requestBody: IDataObject = { data: parsedData };
  if (formatters) {
    requestBody.formatters = formatters;
  }
  const options: IDataObject = {};
  if (convertTo) {
    options.convertTo = convertTo;
  }
  if (reportName) {
    options.reportName = reportName;
  }
  if (Object.keys(options).length) {
    requestBody.options = options;
  }

  const response = await cdogsApiBinaryResponse.call(
    this,
    'POST',
    `/template/${encodeURIComponent(templateHash)}/render`,
    requestBody,
  );

  return buildBinaryOutput.call(this, response, reportName, convertTo, outputField, itemIndex);
}

/**
 * Generate a document from an inline template (text or binary source).
 */
async function executeGenerateFromInline(this: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData[]> {
  const templateSource = this.getNodeParameter('templateSource', itemIndex) as string;
  const overwrite = this.getNodeParameter('overwrite', itemIndex) as boolean;
  const { parsedData, formatters, convertTo, reportName, outputField } = parseRenderParams.call(this, itemIndex);

  const template = await buildInlineTemplate.call(this, itemIndex, templateSource);

  const requestBody: IDataObject = {
    data: parsedData,
    template,
  };
  if (formatters) {
    requestBody.formatters = formatters;
  }
  const options: IDataObject = { overwrite };
  if (convertTo) {
    options.convertTo = convertTo;
  }
  if (reportName) {
    options.reportName = reportName;
  }
  requestBody.options = options;

  const response = await cdogsApiBinaryResponse.call(this, 'POST', '/template/render', requestBody);

  return buildBinaryOutput.call(
    this,
    response,
    reportName,
    convertTo,
    outputField,
    itemIndex,
    String(template.fileType ?? ''),
  );
}

/**
 * Parse common render parameters shared by both generate operations.
 */
function parseRenderParams(this: IExecuteFunctions, itemIndex: number) {
  const dataValue = this.getNodeParameter('data', itemIndex);
  const enableFormatters = this.getNodeParameter('enableFormatters', itemIndex) as boolean;
  const convertTo = this.getNodeParameter('convertTo', itemIndex) as string;
  const reportName = this.getNodeParameter('reportName', itemIndex) as string;
  const outputField = this.getNodeParameter('outputBinaryPropertyName', itemIndex) as string;

  let parsedData: IDataObject | IDataObject[];
  try {
    parsedData = (typeof dataValue === 'string' ? JSON.parse(dataValue) : dataValue) as IDataObject | IDataObject[];
  } catch {
    throw new NodeOperationError(this.getNode(), 'The "Template Data (JSON)" field contains invalid JSON', {
      itemIndex,
    });
  }
  if (!isTemplateData(parsedData)) {
    throw new NodeOperationError(
      this.getNode(),
      'The "Template Data (JSON)" field must contain an object or an array of objects',
      { itemIndex },
    );
  }

  let formatters: string | undefined;
  if (enableFormatters) {
    const formatterValue = this.getNodeParameter('formatters', itemIndex);
    formatters = typeof formatterValue === 'string' ? formatterValue : JSON.stringify(formatterValue);
    try {
      const parsedFormatters = JSON.parse(formatters) as unknown;
      if (!parsedFormatters || typeof parsedFormatters !== 'object' || Array.isArray(parsedFormatters)) {
        throw new Error('Expected an object');
      }
    } catch {
      throw new NodeOperationError(this.getNode(), 'The "Custom Formatters (JSON)" field must be a JSON object', {
        itemIndex,
      });
    }
  }

  return { parsedData, formatters, convertTo, reportName, outputField };
}

function isTemplateData(value: unknown): value is IDataObject | IDataObject[] {
  if (Array.isArray(value)) {
    return value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item));
  }
  return value !== null && typeof value === 'object';
}

/**
 * Extract the HTTP status code from a NodeApiError or raw request error.
 * Used by checkTemplate to distinguish expected 404 from unexpected failures.
 */
function getCheckTemplateErrorStatus(error: unknown): number | undefined {
  // NodeApiError stores the HTTP status in httpCode (string).
  if (error instanceof NodeApiError) {
    const code = (error as NodeApiError & { httpCode?: string }).httpCode;
    if (code) return Number(code);
  }
  // Fallback for raw request errors that might not be wrapped yet.
  const typed = error as { statusCode?: number; response?: { status?: number; statusCode?: number } };
  return typed.statusCode ?? typed.response?.statusCode ?? typed.response?.status;
}

/**
 * Load output file types from the authenticated CDOGS /fileTypes endpoint.
 */
async function getConvertToOptions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  const baseUrl = this.getNodeParameter('baseUrl') as string;
  const url = `${baseUrl.replace(/\/$/, '')}/fileTypes`;

  let response: IDataObject;
  try {
    response = (await this.helpers.httpRequestWithAuthentication.call(this, CDOGS_OAUTH2_CREDENTIAL, {
      method: 'GET',
      url,
      headers: { Accept: 'application/json' },
      json: true,
    })) as IDataObject;
  } catch (error) {
    throw new NodeApiError(this.getNode(), error as JsonObject);
  }

  const dictionary = response.dictionary;
  if (!dictionary || typeof dictionary !== 'object' || Array.isArray(dictionary)) {
    throw new NodeOperationError(this.getNode(), 'CDOGS /fileTypes returned an invalid file type dictionary');
  }

  const currentParameters = this.getCurrentNodeParameters() ?? {};
  const inputFileType =
    currentParameters.operation === 'generateFromInline' && currentParameters.templateSource === 'text'
      ? String(currentParameters.contentFileType ?? '').toLowerCase()
      : '';
  const outputTypes = getSupportedOutputTypes(dictionary as IDataObject, inputFileType);

  return [
    { name: 'None (Same Format)', value: '' },
    ...outputTypes.map((fileType) => ({ name: fileType.toUpperCase(), value: fileType })),
  ];
}

function getSupportedOutputTypes(dictionary: IDataObject, inputFileType: string): string[] {
  const selectedEntry = inputFileType ? dictionary[inputFileType] : undefined;
  const entries = selectedEntry === undefined ? Object.values(dictionary) : [selectedEntry];
  const outputTypes = new Set<string>();

  for (const entry of entries) {
    const values = extractOutputFileTypes(entry);
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) outputTypes.add(value.toLowerCase());
    }
  }

  return [...outputTypes].sort((left, right) => left.localeCompare(right));
}

/**
 * Extract an array of output file types from a dictionary entry.
 * An entry may be an array directly or an object with an outputFileTypes field.
 */
function extractOutputFileTypes(entry: unknown): unknown[] | undefined {
  if (Array.isArray(entry)) return entry;
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const candidate = (entry as IDataObject).outputFileTypes;
    if (Array.isArray(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Build binary output from a CDOGS response buffer.
 * Preserves the source item's JSON so downstream nodes can access metadata
 * without referencing a previous node explicitly.
 */
async function buildBinaryOutput(
  this: IExecuteFunctions,
  response: { body: Buffer; headers: IDataObject },
  reportName: string,
  convertTo: string,
  outputField: string,
  itemIndex: number,
  sourceFileType = '',
): Promise<INodeExecutionData[]> {
  const fileName = buildFileName(reportName, convertTo, response.headers, sourceFileType);
  const binary = await this.helpers.prepareBinaryData(response.body, fileName);
  const sourceJson = this.getInputData()[itemIndex].json;
  return this.helpers.constructExecutionMetaData([{ json: { ...sourceJson }, binary: { [outputField]: binary } }], {
    itemData: { item: itemIndex },
  });
}

/**
 * Build the inline template object from binary or text source.
 */
async function buildInlineTemplate(
  this: IExecuteFunctions,
  itemIndex: number,
  templateSource: string,
): Promise<IDataObject> {
  if (templateSource === 'binary') {
    const binaryInput = this.getNodeParameter('templateBinaryPropertyName', itemIndex) as string | IBinaryData;
    const binaryData = this.helpers.assertBinaryData(itemIndex, binaryInput);
    const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryInput);
    const content = buffer.toString('base64');
    const fileType = (binaryData.fileExtension || binaryData.fileName?.split('.').pop() || 'docx').toLowerCase();
    return {
      content,
      encodingType: 'base64',
      fileType,
    };
  }

  // Text source
  const templateContent = this.getNodeParameter('templateContent', itemIndex) as string;
  const contentFileType = this.getNodeParameter('contentFileType', itemIndex) as string;
  const content = Buffer.from(templateContent, 'utf-8').toString('base64');
  return {
    content,
    encodingType: 'base64',
    fileType: contentFileType,
  };
}

/**
 * Common MIME type to file extension mapping for document generation.
 */
const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/rtf': 'rtf',
  'text/html': 'html',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/**
 * Determine output filename from reportName, convertTo, or response headers.
 * Uses Content-Type as an extension fallback when no filename is available.
 */
function buildFileName(reportName: string, convertTo: string, headers: IDataObject, sourceFileType = ''): string {
  const responseFileName = getResponseFileName(headers);
  const contentTypeExt = getExtensionFromContentType(headers);
  const extension = convertTo || sourceFileType || getFileExtension(responseFileName) || contentTypeExt || 'bin';

  if (reportName) {
    return reportName.toLowerCase().endsWith(`.${extension.toLowerCase()}`) ? reportName : `${reportName}.${extension}`;
  }

  if (responseFileName) {
    return responseFileName;
  }

  return `document.${extension}`;
}

/**
 * Infer a file extension from the Content-Type response header.
 */
function getExtensionFromContentType(headers: IDataObject): string {
  const contentType = getHeaderValue(headers, 'content-type');
  if (!contentType) return '';
  // Strip parameters (e.g. "; charset=utf-8")
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  return MIME_TO_EXTENSION[mimeType] ?? '';
}

/**
 * Extract filename from response headers with robust parsing:
 * - RFC 5987 `filename*=UTF-8''...` (preferred, URL-encoded)
 * - Standard `filename="..."` or `filename=...`
 * - Fallback to x-report-name header
 * - Path traversal sanitization (strips directory components)
 */
function getResponseFileName(headers: IDataObject): string {
  const disposition = getHeaderValue(headers, 'content-disposition');

  if (disposition) {
    const parsed = parseContentDisposition(disposition);
    if (parsed) return parsed;
  }

  const reportName = getHeaderValue(headers, 'x-report-name');
  return reportName ? sanitizeFileName(reportName) : '';
}

/**
 * Parse a Content-Disposition header value to extract the filename.
 * Returns the sanitized filename or empty string if none found.
 */
function parseContentDisposition(disposition: string): string {
  // Prefer RFC 5987 filename* (handles UTF-8 encoded filenames)
  const rfc5987Name = parseRfc5987Filename(disposition);
  if (rfc5987Name) return rfc5987Name;

  // Standard filename with quotes: filename="name.ext"
  const quotedMatch = /filename\s*=\s*"([^"]+)"/i.exec(disposition);
  if (quotedMatch?.[1]) return sanitizeFileName(quotedMatch[1]);

  // Unquoted filename: filename=name.ext
  const unquotedMatch = /filename\s*=\s*([^\s;]+)/i.exec(disposition);
  if (unquotedMatch?.[1]) return sanitizeFileName(unquotedMatch[1]);

  return '';
}

/**
 * Attempt to parse an RFC 5987 filename* value from a Content-Disposition header.
 */
function parseRfc5987Filename(disposition: string): string {
  const match = /filename\*\s*=\s*(?:UTF-8|utf-8)''(.+?)(?:;|$)/i.exec(disposition);
  if (!match?.[1]) return '';
  try {
    return sanitizeFileName(decodeURIComponent(match[1].trim()));
  } catch {
    return '';
  }
}

/**
 * Strip path traversal and directory components, returning only the basename.
 */
function sanitizeFileName(name: string): string {
  // Remove any path separators — keep only the final segment
  const basename = name.replace(/^.*[/\\]/, '');
  // Remove null bytes and other control characters
  return basename.replace(/[\x00-\x1f]/g, '').trim();
}

function getHeaderValue(headers: IDataObject, headerName: string): string {
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === headerName);
  const value = entry?.[1];
  return typeof value === 'string' ? value : '';
}

function getFileExtension(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName);
  return match?.[1]?.toLowerCase() ?? '';
}
