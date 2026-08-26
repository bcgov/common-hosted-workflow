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
    if (!/^[a-zA-Z0-9_]{2,16}(?:\+[a-zA-Z0-9_]{2,16}){0,4}$/.test(language)) {
      throw new NodeOperationError(
        this.getNode(),
        'OCR Language must contain up to five language codes separated by +',
      );
    }

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
          const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
          const destinationField = (this.getNodeParameter('destinationField', itemIndex) as string).trim();
          if (!destinationField) {
            throw new NodeOperationError(this.getNode(), 'Destination Field is required', { itemIndex });
          }
          const options = getOptions(this, itemIndex);
          if (options.pageSeparator.length > 1000) {
            throw new NodeOperationError(this.getNode(), 'Page Separator cannot exceed 1,000 characters', {
              itemIndex,
            });
          }
          const binary = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
          const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);

          if (buffer.length > MAX_FILE_SIZE_BYTES) {
            throw new NodeOperationError(this.getNode(), 'The input file exceeds the 25 MB limit', { itemIndex });
          }

          const result = await extractDocumentText(buffer, binary.mimeType, options, ocrEngine);
          const output: INodeExecutionData = {
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
          if (keepBinary) output.binary = item.binary;
          returnData.push(output);
        } catch (error) {
          if (this.continueOnFail()) {
            const errorItem: INodeExecutionData = {
              json: { ...item.json, error: getErrorMessage(error) },
              pairedItem: { item: itemIndex },
            };
            if (keepBinary) errorItem.binary = item.binary;
            returnData.push(errorItem);
            continue;
          }
          if (error instanceof NodeOperationError) throw error;
          throw new NodeOperationError(this.getNode(), getErrorMessage(error), { itemIndex });
        }
      }
    } finally {
      await ocrEngine.terminate();
    }

    return [returnData];
  }
}
