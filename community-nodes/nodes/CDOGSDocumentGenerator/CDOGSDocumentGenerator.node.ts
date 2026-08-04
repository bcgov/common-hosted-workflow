/* eslint-disable @n8n/community-nodes/no-credential-reuse, @n8n/community-nodes/valid-credential-references */
import {
  NodeConnectionTypes,
  NodeApiError,
  NodeOperationError,
  type IExecuteFunctions,
  type INodeExecutionData,
  type IDataObject,
  type IHttpRequestOptions,
  type JsonObject,
  type INodeType,
  type INodeTypeDescription,
} from 'n8n-workflow';
import { cdogsApiRequest, cdogsApiBinaryResponse } from './shared/GenericFunctions';

export class CDOGSDocumentGenerator implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'CDOGS',
    name: 'cdogs',
    description:
      'Interact with the Common Document Generation Service (CDOGS) API to generate documents from templates',
    icon: { light: 'file:../../icons/document-generate.svg', dark: 'file:../../icons/document-generate.dark.svg' },
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    defaults: {
      name: 'CDOGS',
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'oAuth2Api',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Base URL',
        name: 'baseUrl',
        type: 'string',
        default: 'https://cdogs.api.gov.bc.ca/api/v2',
        required: true,
        description: 'The base URL of the CDOGS API (v2 endpoint)',
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
        description: 'The name of the input binary field containing the template file',
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
        displayName: 'Convert To',
        name: 'convertTo',
        type: 'options',
        options: [
          { name: 'DOCX', value: 'docx' },
          { name: 'HTML', value: 'html' },
          { name: 'None (Same Format)', value: '' },
          { name: 'PDF', value: 'pdf' },
          { name: 'PPTX', value: 'pptx' },
          { name: 'TXT', value: 'txt' },
          { name: 'XLSX', value: 'xlsx' },
        ],
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
        default: false,
        displayOptions: {
          show: {
            operation: ['generateFromExisting'],
          },
        },
        description: 'Whether to overwrite the cached template on the server',
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
        description: 'The name of the input binary field containing the template file',
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
        options: [
          { name: 'DOCX', value: 'docx' },
          { name: 'HTML', value: 'html' },
          { name: 'PPTX', value: 'pptx' },
          { name: 'TXT', value: 'txt' },
          { name: 'XLSX', value: 'xlsx' },
        ],
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

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const operation = this.getNodeParameter('operation', 0) as string;

    for (const [i] of items.entries()) {
      try {
        const result = await executeOperation.call(this, operation, i);
        returnData.push(...result);
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: (error as Error).message } as IDataObject,
            pairedItem: { item: i },
          });
          continue;
        }
        if ((error as Error & { response?: unknown }).response) {
          throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
        }
        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
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
  const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
  const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
  const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);

  const baseUrl = this.getNodeParameter('baseUrl', 0) as string;
  const url = `${baseUrl.replace(/\/$/, '')}/template`;

  const options: IHttpRequestOptions = {
    method: 'POST',
    url,
    body: buffer,
    headers: {
      'Content-Type': binaryData.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${binaryData.fileName || 'template'}"`,
    },
    returnFullResponse: true,
  };

  const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'oAuth2Api', options)) as {
    headers: IDataObject;
    body: IDataObject;
  };

  const hash = (response.headers?.['x-template-hash'] as string) ?? '';

  return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray({ hash, ...(response.body ?? {}) }), {
    itemData: { item: itemIndex },
  });
}

/**
 * Generate a document from a previously uploaded template.
 */
async function executeGenerateFromExisting(this: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData[]> {
  const templateHash = this.getNodeParameter('templateHash', itemIndex) as string;
  const dataStr = this.getNodeParameter('data', itemIndex) as string;
  const convertTo = this.getNodeParameter('convertTo', itemIndex) as string;
  const reportName = this.getNodeParameter('reportName', itemIndex) as string;
  const overwrite = this.getNodeParameter('overwrite', itemIndex) as boolean;
  const outputField = this.getNodeParameter('outputBinaryPropertyName', itemIndex) as string;

  let parsedData: IDataObject;
  try {
    parsedData = JSON.parse(dataStr) as IDataObject;
  } catch {
    throw new NodeOperationError(this.getNode(), 'The "Template Data (JSON)" field contains invalid JSON', {
      itemIndex,
    });
  }

  const requestBody: IDataObject = { data: parsedData };
  if (convertTo) {
    requestBody.options = { convertTo, overwrite };
    if (reportName) {
      (requestBody.options as IDataObject).reportName = reportName;
    }
  }

  const response = await cdogsApiBinaryResponse.call(
    this,
    'POST',
    `/template/${encodeURIComponent(templateHash)}/render`,
    requestBody,
  );

  const fileName = buildFileName(reportName, convertTo, response.headers);
  const binary = await this.helpers.prepareBinaryData(response.body, fileName);

  const executionData = this.helpers.constructExecutionMetaData([{ json: {}, binary: { [outputField]: binary } }], {
    itemData: { item: itemIndex },
  });
  return executionData;
}

/**
 * Generate a document from an inline template (text or binary source).
 */
async function executeGenerateFromInline(this: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData[]> {
  const templateSource = this.getNodeParameter('templateSource', itemIndex) as string;
  const dataStr = this.getNodeParameter('data', itemIndex) as string;
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

  const template = await buildInlineTemplate.call(this, itemIndex, templateSource);

  const requestBody: IDataObject = {
    data: parsedData,
    template,
  };
  if (convertTo) {
    const options: IDataObject = { convertTo };
    if (reportName) {
      options.reportName = reportName;
    }
    requestBody.options = options;
  }

  const response = await cdogsApiBinaryResponse.call(this, 'POST', '/template/render', requestBody);

  const fileName = buildFileName(reportName, convertTo, response.headers);
  const binary = await this.helpers.prepareBinaryData(response.body, fileName);

  const executionData = this.helpers.constructExecutionMetaData([{ json: {}, binary: { [outputField]: binary } }], {
    itemData: { item: itemIndex },
  });
  return executionData;
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
    const binaryField = this.getNodeParameter('templateBinaryPropertyName', itemIndex) as string;
    const binaryData = this.helpers.assertBinaryData(itemIndex, binaryField);
    const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryField);
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
function buildFileName(reportName: string, convertTo: string, headers: IDataObject): string {
  if (reportName) {
    const ext = convertTo || 'bin';
    return `${reportName}.${ext}`;
  }
  const disposition = (headers?.['content-disposition'] as string) ?? '';
  const match = /filename="?([^";\n]+)"?/i.exec(disposition);
  if (match?.[1]) {
    return match[1];
  }
  return `document.${convertTo || 'bin'}`;
}
