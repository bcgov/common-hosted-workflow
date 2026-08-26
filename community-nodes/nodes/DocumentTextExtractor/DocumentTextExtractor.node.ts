import {
  NodeConnectionTypes,
  NodeOperationError,
  type IDataObject,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeType,
  type INodeTypeDescription,
} from 'n8n-workflow';
import {
  extractDocumentText,
  type ExtractionMode,
  type ExtractionOptions,
  type OcrProvider,
  type PageSegmentationMode,
} from './shared/extractor';
import { getErrorMessage } from './shared/errors';
import { OcrEngine } from './shared/ocrEngine';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function getOptions(ctx: IExecuteFunctions, itemIndex: number): ExtractionOptions {
  return {
    mode: ctx.getNodeParameter('mode', 0) as ExtractionMode,
    language: (ctx.getNodeParameter('language', 0) as string).trim(),
    pageSegmentationMode: ctx.getNodeParameter('pageSegmentationMode', 0) as PageSegmentationMode,
    renderScale: ctx.getNodeParameter('renderScale', itemIndex) as number,
    maxPages: ctx.getNodeParameter('maxPages', itemIndex) as number,
    minimumTextLength: ctx.getNodeParameter('minimumTextLength', itemIndex) as number,
    pageSeparator: ctx.getNodeParameter('pageSeparator', itemIndex) as string,
    maxCharacters: ctx.getNodeParameter('maxCharacters', itemIndex) as number,
    documentTimeoutMs: ctx.getNodeParameter('documentTimeoutMs', 0) as number,
    password: ctx.getNodeParameter('password', itemIndex, '') as string,
  };
}

function validateLanguage(ctx: IExecuteFunctions, language: string): void {
  if (!/^\w{2,16}(?:\+\w{2,16}){0,4}$/.test(language)) {
    throw new NodeOperationError(ctx.getNode(), 'OCR Language must contain up to five language codes separated by +');
  }
}

function validateDestinationField(ctx: IExecuteFunctions, value: string, itemIndex: number): void {
  if (!value) {
    throw new NodeOperationError(ctx.getNode(), 'Destination Field is required', { itemIndex });
  }
}

function validatePageSeparator(ctx: IExecuteFunctions, value: string, itemIndex: number): void {
  if (value.length > 1000) {
    throw new NodeOperationError(ctx.getNode(), 'Page Separator cannot exceed 1,000 characters', {
      itemIndex,
    });
  }
}

function validateFileSize(ctx: IExecuteFunctions, buffer: Buffer, itemIndex: number): void {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new NodeOperationError(ctx.getNode(), 'The input file exceeds the 25 MB limit', { itemIndex });
  }
}

function buildSuccessOutput(
  item: INodeExecutionData,
  result: Awaited<ReturnType<typeof extractDocumentText>>,
  binary: { fileName?: string; mimeType?: string },
  destinationField: string,
  itemIndex: number,
): INodeExecutionData {
  return {
    json: {
      ...item.json,
      [destinationField]: {
        ...result,
        pages: result.pages as unknown as IDataObject[],
        sourceFileName: binary.fileName ?? null,
        sourceMimeType: binary.mimeType ?? null,
      },
    },
    pairedItem: { item: itemIndex },
  };
}

function buildErrorOutput(item: INodeExecutionData, error: unknown, itemIndex: number): INodeExecutionData {
  return {
    json: { ...item.json, error: getErrorMessage(error) },
    pairedItem: { item: itemIndex },
  };
}

function rethrowAsNodeError(ctx: IExecuteFunctions, error: unknown, itemIndex: number): never {
  if (error instanceof NodeOperationError) throw error;
  throw new NodeOperationError(ctx.getNode(), getErrorMessage(error), { itemIndex });
}

async function processItem(
  ctx: IExecuteFunctions,
  item: INodeExecutionData,
  itemIndex: number,
  ocrEngine: OcrProvider & { terminate(): Promise<void> },
): Promise<INodeExecutionData> {
  const binaryPropertyName = ctx.getNodeParameter('binaryPropertyName', itemIndex) as string;
  const destinationField = (ctx.getNodeParameter('destinationField', itemIndex) as string).trim();
  validateDestinationField(ctx, destinationField, itemIndex);

  const options = getOptions(ctx, itemIndex);
  validatePageSeparator(ctx, options.pageSeparator, itemIndex);

  const binary = ctx.helpers.assertBinaryData(itemIndex, binaryPropertyName);
  const buffer = await ctx.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
  validateFileSize(ctx, buffer, itemIndex);

  const result = await extractDocumentText(buffer, binary.mimeType, options, ocrEngine);
  return buildSuccessOutput(item, result, binary, destinationField, itemIndex);
}

export class DocumentTextExtractor implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Document Text Extractor',
    name: 'documentTextExtractor',
    description: 'Extract embedded text and perform OCR on PDF and image files',
    icon: {
      light: 'file:../../icons/document-text-extractor.svg',
      dark: 'file:../../icons/document-text-extractor.dark.svg',
    },
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["mode"]}}',
    defaults: { name: 'Document Text Extractor' },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    properties: [
      {
        displayName: 'Input Binary Field',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        required: true,
        description: 'Name of the binary field containing the PDF or image',
      },
      {
        displayName: 'PDF Extraction Mode',
        name: 'mode',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Automatic',
            value: 'auto',
            description: 'Use embedded PDF text and OCR pages that contain too little text',
          },
          {
            name: 'Embedded Text Only',
            value: 'text',
            description: 'Read the PDF text layer without OCR',
          },
          {
            name: 'OCR All Pages',
            value: 'ocr',
            description: 'Render and OCR every processed PDF page',
          },
        ],
        default: 'auto',
        description: 'Images are always processed using OCR',
      },
      {
        displayName: 'OCR Language',
        name: 'language',
        type: 'string',
        noDataExpression: true,
        default: 'eng',
        required: true,
        description: 'Tesseract language code, such as eng or fra; multiple languages can use eng+fra',
      },
      {
        displayName: 'Page Segmentation',
        name: 'pageSegmentationMode',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Automatic', value: 'auto' },
          { name: 'Single Block', value: 'singleBlock' },
          { name: 'Single Column', value: 'singleColumn' },
          { name: 'Sparse Text', value: 'sparseText' },
        ],
        default: 'auto',
        description: 'How Tesseract should interpret the layout of OCR input',
      },
      {
        displayName: 'Maximum PDF Pages',
        name: 'maxPages',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 100, numberPrecision: 0 },
        default: 20,
        description: 'Maximum number of PDF pages to process',
      },
      {
        displayName: 'PDF Render Scale',
        name: 'renderScale',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 4, numberPrecision: 1 },
        default: 2,
        description: 'Scale used when rendering PDF pages for OCR; larger values improve detail but use more memory',
      },
      {
        displayName: 'Minimum Embedded Text Length',
        name: 'minimumTextLength',
        type: 'number',
        typeOptions: { minValue: 0, maxValue: 10000, numberPrecision: 0 },
        displayOptions: { show: { mode: ['auto'] } },
        default: 20,
        description: 'Minimum non-whitespace character count per PDF page before OCR fallback is skipped',
      },
      {
        displayName: 'PDF Password',
        name: 'password',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        description: 'Password for an encrypted PDF, if required',
      },
      {
        displayName: 'Page Separator',
        name: 'pageSeparator',
        type: 'string',
        default: '\n\n',
        description: 'Text inserted between pages in the combined output',
      },
      {
        displayName: 'Maximum Output Characters',
        name: 'maxCharacters',
        type: 'number',
        typeOptions: { minValue: 1000, maxValue: 10000000, numberPrecision: 0 },
        default: 1000000,
        description: 'Maximum number of extracted characters returned for each input item',
      },
      {
        displayName: 'Document Timeout (ms)',
        name: 'documentTimeoutMs',
        type: 'number',
        noDataExpression: true,
        typeOptions: { minValue: 1000, maxValue: 300000, numberPrecision: 0 },
        default: 120000,
        description: 'Maximum total processing time for each document',
      },
      {
        displayName: 'Destination Field',
        name: 'destinationField',
        type: 'string',
        default: 'documentText',
        required: true,
        description: 'Top-level output field that will contain the extraction result',
      },
      {
        displayName: 'Keep Input Binary',
        name: 'keepBinary',
        type: 'boolean',
        default: false,
        description: 'Whether to include the original binary data in the output item',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    if (items.length === 0) return [[]];

    const language = (this.getNodeParameter('language', 0) as string).trim();
    validateLanguage(this, language);

    const pageSegmentationMode = this.getNodeParameter('pageSegmentationMode', 0) as PageSegmentationMode;
    const documentTimeoutMs = this.getNodeParameter('documentTimeoutMs', 0) as number;
    const ocrEngine: OcrProvider & { terminate(): Promise<void> } = new OcrEngine(
      language,
      pageSegmentationMode,
      documentTimeoutMs,
    );
    const returnData: INodeExecutionData[] = [];

    try {
      for (const [itemIndex, item] of items.entries()) {
        const keepBinary = this.getNodeParameter('keepBinary', itemIndex) as boolean;
        try {
          const output = await processItem(this, item, itemIndex, ocrEngine);
          if (keepBinary) output.binary = item.binary;
          returnData.push(output);
        } catch (error) {
          if (this.continueOnFail()) {
            const errorItem = buildErrorOutput(item, error, itemIndex);
            if (keepBinary) errorItem.binary = item.binary;
            returnData.push(errorItem);
            continue;
          }
          rethrowAsNodeError(this, error, itemIndex);
        }
      }
    } finally {
      await ocrEngine.terminate();
    }

    return [returnData];
  }
}
