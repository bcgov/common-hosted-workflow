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
        description: 'JSON object containing the template variable data for rendering',
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
          if ((error as Error & { response?: unknown }).response) {
            throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
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
    const response = await cdogsApiRequest.call(this, 'GET', `/template/${encodeURIComponent(templateHash)}`);
    return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(response), {
      itemData: { item: itemIndex },
    });
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
  const dataStr = this.getNodeParameter('data', itemIndex) as string;
  const enableFormatters = this.getNodeParameter('enableFormatters', itemIndex) as boolean;
  const convertTo = this.getNodeParameter('convertTo', itemIndex) as string;
  const reportName = this.getNodeParameter('reportName', itemIndex) as string;
  const outputField = this.getNodeParameter('outputBinaryPropertyName', itemIndex) as string;

  let parsedData: IDataObject;
  try {
    parsedData = JSON.parse(dataStr) as IDataObject;
  } catch {
    throw new NodeOperationError(this.getNode(), 'The "Template Data (JSON)" field contains invalid JSON', {
      itemIndex,
    });
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
    const values = Array.isArray(entry)
      ? entry
      : entry && typeof entry === 'object' && !Array.isArray(entry)
        ? (entry as IDataObject).outputFileTypes
        : undefined;
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) outputTypes.add(value.toLowerCase());
    }
  }

  return [...outputTypes].sort((left, right) => left.localeCompare(right));
}

/**
 * Build binary output from a CDOGS response buffer.
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
  return this.helpers.constructExecutionMetaData([{ json: {}, binary: { [outputField]: binary } }], {
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
 * Determine output filename from reportName, convertTo, or response headers.
 */
function buildFileName(reportName: string, convertTo: string, headers: IDataObject, sourceFileType = ''): string {
  const responseFileName = getResponseFileName(headers);
  const extension = convertTo || sourceFileType || getFileExtension(responseFileName) || 'bin';

  if (reportName) {
    return reportName.toLowerCase().endsWith(`.${extension.toLowerCase()}`) ? reportName : `${reportName}.${extension}`;
  }

  if (responseFileName) {
    return responseFileName;
  }

  return `document.${extension}`;
}

function getResponseFileName(headers: IDataObject): string {
  const disposition = getHeaderValue(headers, 'content-disposition');
  const match = /filename="?([^";\n]+)"?/i.exec(disposition);
  if (match?.[1]) {
    return match[1];
  }

  return getHeaderValue(headers, 'x-report-name');
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
