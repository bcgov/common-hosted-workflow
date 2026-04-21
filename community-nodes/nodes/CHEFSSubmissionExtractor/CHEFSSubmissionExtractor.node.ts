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
import type { ChefsFormCredentials, FieldMapping } from './shared/types';
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
        // Step 1: Read node parameters
        const submissionId = (this.getNodeParameter('submissionId', i) as string).trim();
        if (!submissionId) {
          throw new NodeOperationError(this.getNode(), 'Submission ID is required and cannot be empty', {
            itemIndex: i,
          });
        }
        const missingPathBehavior = this.getNodeParameter('missingPathBehavior', i) as string;
        const includeSubmissionMeta = this.getNodeParameter('includeSubmissionMeta', i) as boolean;

        // Step 2: Parse field mappings from either UI or JSON mode
        const mappings = parseFieldMappings(this, i);

        // Step 3: Fetch submission from CHEFS API
        const response = await chefsApiRequest(this, 'GET', `/submissions/${submissionId}`, credentials);

        // Step 4: Validate response structure and extract submission data
        // The CHEFS API wraps everything in a top-level `submission` key.
        // Form data lives at response.submission.submission.data
        // Metadata lives at response.submission.createdBy, etc.
        const inner = response.submission;
        if (!inner) {
          throw new NodeOperationError(
            this.getNode(),
            'Unexpected CHEFS API response structure: missing submission wrapper',
            { itemIndex: i },
          );
        }

        if (
          !inner.submission ||
          typeof inner.submission !== 'object' ||
          !('data' in inner.submission) ||
          inner.submission.data == null
        ) {
          throw new NodeOperationError(
            this.getNode(),
            'Unexpected CHEFS API response structure: missing submission data',
            { itemIndex: i },
          );
        }

        const submissionData = inner.submission.data as Record<string, unknown>;

        // Step 5: Validate all field paths exist in submission
        const validation = validateFieldPaths(submissionData, mappings);

        // Step 6: Handle missing paths based on configured behavior
        if (!validation.valid) {
          if (missingPathBehavior === 'throwError') {
            const missingList = validation.missingPaths
              .map((m) => `"${m.outputKey}" (path: ${m.sourcePath})`)
              .join(', ');
            throw new NodeOperationError(
              this.getNode(),
              `The following fields do not exist on the submission: ${missingList}`,
              { itemIndex: i },
            );
          }
          // missingPathBehavior === 'returnNull': fall through to extraction
        }

        // Step 7: Extract fields — returns null for missing paths when in returnNull mode
        const extracted = extractFields(submissionData, mappings);

        // Step 8: Optionally append submission metadata
        if (includeSubmissionMeta) {
          extracted['_createdBy'] = inner.createdBy;
          extracted['_createdAt'] = inner.createdAt;
          extracted['_updatedBy'] = inner.updatedBy;
          extracted['_updatedAt'] = inner.updatedAt;
        }

        // Step 9: Return filtered result with item linking
        const executionData = this.helpers.constructExecutionMetaData(
          this.helpers.returnJsonArray(extracted as IDataObject),
          { itemData: { item: i } },
        );
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
