import {
  NodeConnectionTypes,
  NodeApiError,
  NodeOperationError,
  type INodeType,
  type INodeTypeDescription,
  type IExecuteFunctions,
  type INodeExecutionData,
  type IDataObject,
  type JsonObject,
} from 'n8n-workflow';
import type { ChefsFormCredentials, ChefsSubmissionInner, FieldMapping } from './shared/types';
import { validateFieldPaths, extractFields } from './shared/fieldExtractor';
import { chefsApiRequest } from './shared/chefsApiRequest';

/**
 * Parses field mappings from either the UI key-value collection or JSON input.
 *
 * @param ctx - The execution context
 * @param itemIndex - The current item index
 * @returns An array of FieldMapping entries
 * @throws NodeOperationError if JSON is malformed or no mappings are provided
 */
function parseFieldMappings(ctx: IExecuteFunctions, itemIndex: number): FieldMapping[] {
  const mode = ctx.getNodeParameter('fieldMappingMode', itemIndex) as string;

  let mappings: FieldMapping[];

  if (mode === 'json') {
    const jsonStr = ctx.getNodeParameter('fieldMappingJson', itemIndex) as string;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      throw new NodeOperationError(ctx.getNode(), `Invalid field mapping JSON: ${(e as Error).message}`, { itemIndex });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new NodeOperationError(
        ctx.getNode(),
        'Field mapping JSON must be a flat object mapping output keys to source path strings',
        { itemIndex },
      );
    }
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof val !== 'string') {
        throw new NodeOperationError(
          ctx.getNode(),
          `Field mapping value for "${key}" must be a string, got ${typeof val}`,
          { itemIndex },
        );
      }
    }
    mappings = Object.entries(parsed as Record<string, string>).map(([outputKey, sourcePath]) => ({
      outputKey,
      sourcePath,
    }));
  } else {
    // mode === 'keyValue'
    const collection = ctx.getNodeParameter('fieldMappings', itemIndex) as {
      mapping?: Array<{ outputKey: string; sourcePath: string }>;
    };
    mappings = (collection.mapping ?? []).map(({ outputKey, sourcePath }) => ({
      outputKey,
      sourcePath,
    }));
  }

  if (mappings.length === 0) {
    throw new NodeOperationError(ctx.getNode(), 'At least one field mapping is required', { itemIndex });
  }

  return mappings;
}

/**
 * Validates the CHEFS API response structure and returns the inner submission object.
 *
 * @throws NodeOperationError if the response is missing expected keys
 */
function validateResponseStructure(
  ctx: IExecuteFunctions,
  response: { submission?: ChefsSubmissionInner },
  itemIndex: number,
): ChefsSubmissionInner {
  const inner = response.submission;
  if (!inner) {
    throw new NodeOperationError(ctx.getNode(), 'Unexpected CHEFS API response structure: missing submission wrapper', {
      itemIndex,
    });
  }

  if (
    !inner.submission ||
    typeof inner.submission !== 'object' ||
    !('data' in inner.submission) ||
    inner.submission.data == null
  ) {
    throw new NodeOperationError(ctx.getNode(), 'Unexpected CHEFS API response structure: missing submission data', {
      itemIndex,
    });
  }

  return inner;
}

/**
 * Processes a single input item: fetches the submission, validates paths, extracts fields.
 */
async function processItem(
  ctx: IExecuteFunctions,
  itemIndex: number,
  credentials: ChefsFormCredentials,
): Promise<INodeExecutionData[]> {
  const submissionId = (ctx.getNodeParameter('submissionId', itemIndex) as string).trim();
  if (!submissionId) {
    throw new NodeOperationError(ctx.getNode(), 'Submission ID is required and cannot be empty', { itemIndex });
  }

  const missingPathBehavior = ctx.getNodeParameter('missingPathBehavior', itemIndex) as string;
  const includeSubmissionMeta = ctx.getNodeParameter('includeSubmissionMeta', itemIndex) as boolean;
  const mappings = parseFieldMappings(ctx, itemIndex);

  const response = await chefsApiRequest(ctx, 'GET', `/submissions/${submissionId}`, credentials);
  const inner = validateResponseStructure(ctx, response, itemIndex);
  const submissionData = inner.submission.data;

  // Validate field paths and handle missing ones
  const validation = validateFieldPaths(submissionData, mappings);
  if (!validation.valid && missingPathBehavior === 'throwError') {
    const missingList = validation.missingPaths.map((m) => `"${m.outputKey}" (path: ${m.sourcePath})`).join(', ');
    throw new NodeOperationError(ctx.getNode(), `The following fields do not exist on the submission: ${missingList}`, {
      itemIndex,
    });
  }

  const extracted = extractFields(submissionData, mappings);

  if (includeSubmissionMeta) {
    extracted['_createdBy'] = inner.createdBy;
    extracted['_createdAt'] = inner.createdAt;
    extracted['_updatedBy'] = inner.updatedBy;
    extracted['_updatedAt'] = inner.updatedAt;
  }

  return ctx.helpers.constructExecutionMetaData(ctx.helpers.returnJsonArray(extracted as IDataObject), {
    itemData: { item: itemIndex },
  });
}

export class CHEFSSubmissionExtractor implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'CHEFS Submission Extractor',
    name: 'chefsSubmissionExtractor',
    description: 'Fetch a CHEFS form submission and extract specific fields using dot-notation path mappings',
    icon: { light: 'file:../../icons/chefs.svg', dark: 'file:../../icons/chefs.dark.svg' },
    group: ['transform'],
    version: 1,
    subtitle: '=Extract fields from submission',
    defaults: {
      name: 'CHEFS Submission Extractor',
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'chefsFormAuth',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Submission ID',
        name: 'submissionId',
        type: 'string',
        required: true,
        default: '',
        description: 'The ID of the submission to retrieve',
      },
      {
        displayName: 'Field Mapping Mode',
        name: 'fieldMappingMode',
        type: 'options',
        options: [
          { name: 'UI Field Pairs', value: 'keyValue' },
          { name: 'JSON', value: 'json' },
        ],
        default: 'keyValue',
        description: 'Choose how to define field mappings',
      },
      {
        displayName: 'Missing Path Behavior',
        name: 'missingPathBehavior',
        type: 'options',
        options: [
          { name: 'Return Null', value: 'returnNull' },
          { name: 'Throw Error', value: 'throwError' },
        ],
        default: 'returnNull',
        description:
          'What to do when a source path does not exist in the submission data. "Return Null" places null in the output for unresolved paths. "Throw Error" raises a catchable error listing all missing paths.',
      },
      {
        displayName: 'Include Submission Metadata',
        name: 'includeSubmissionMeta',
        type: 'boolean',
        default: false,
        description:
          'When enabled, appends submission-level metadata fields (_createdBy, _createdAt, _updatedBy, _updatedAt) from the API response to the output object. These are prefixed with underscore to avoid collision with user-defined output keys.',
      },
      {
        displayName: 'Field Mappings',
        name: 'fieldMappings',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        displayOptions: { show: { fieldMappingMode: ['keyValue'] } },
        default: {},
        options: [
          {
            name: 'mapping',
            displayName: 'Mapping',
            values: [
              {
                displayName: 'Output Key',
                name: 'outputKey',
                type: 'string',
                default: '',
                description: 'The key name in the output object',
              },
              {
                displayName: 'Source Path',
                name: 'sourcePath',
                type: 'string',
                default: '',
                description:
                  'Dot-notation path into the submission data, e.g. company.headquarters.address.city or items.0.name',
              },
            ],
          },
        ],
        description: 'Define output key to source path mappings',
      },
      {
        displayName: 'Field Mapping JSON',
        name: 'fieldMappingJson',
        type: 'json',
        displayOptions: { show: { fieldMappingMode: ['json'] } },
        default: '{}',
        description:
          'JSON object mapping output keys to dot-notation source paths, e.g. { "city": "company.address.city" }',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = (await this.getCredentials('chefsFormAuth')) as unknown as ChefsFormCredentials;

    if (!credentials.formId || !credentials.apiKey) {
      throw new NodeOperationError(this.getNode(), 'CHEFS credentials are incomplete: formId and apiKey are required');
    }

    for (let i = 0; i < items.length; i++) {
      try {
        const executionData = await processItem(this, i, credentials);
        returnData.push(...executionData);
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: (error as Error).message },
            pairedItem: { item: i },
          });
          continue;
        }
        if (error instanceof NodeOperationError) {
          throw error;
        }
        if ((error as Error & { response?: unknown }).response) {
          throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
        }
        throw error;
      }
    }

    return [returnData];
  }
}
