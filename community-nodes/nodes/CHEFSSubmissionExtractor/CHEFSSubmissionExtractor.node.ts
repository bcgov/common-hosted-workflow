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
 * How draft and deleted submissions are handled. Stored in the `draftDeletedHandling` parameter.
 * A missing value means PROCESS, so workflows saved before this option existed behave as before.
 */
export const DRAFT_DELETED_HANDLING = {
  /** Treat drafts and deleted submissions like any other submission (the default). */
  PROCESS: 'process',
  /** Output nothing for them, so the run stops at this node without an error. */
  STOP: 'stop',
  /** Send them to extra "Draft" and "Deleted" outputs. */
  ROUTE: 'route',
} as const;

/** Which output a processed submission belongs to. A deleted draft counts as deleted. */
export type SubmissionKind = 'submission' | 'draft' | 'deleted';

/**
 * Builds the node's outputs from its parameters. n8n evaluates this in the editor and at run
 * time (it is serialized into the `outputs` expression), so it must stay self-contained.
 * A missing value means the default, "process", which has a single output.
 */
export const configuredOutputs = (parameters: { draftDeletedHandling?: string }) => {
  const handling = parameters.draftDeletedHandling ?? 'process';
  if (handling === 'route') {
    return [
      { type: 'main', displayName: 'Submission' },
      { type: 'main', displayName: 'Draft' },
      { type: 'main', displayName: 'Deleted' },
    ];
  }
  return [{ type: 'main' }];
};

/** Result of processing one input item: the output items, and what kind of submission it is. */
interface ProcessedItem {
  items: INodeExecutionData[];
  kind: SubmissionKind;
}

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
): Promise<ProcessedItem> {
  const submissionId = (ctx.getNodeParameter('submissionId', itemIndex) as string).trim();
  if (!submissionId) {
    throw new NodeOperationError(ctx.getNode(), 'Submission ID is required and cannot be empty', { itemIndex });
  }

  const mode = ctx.getNodeParameter('fieldMappingMode', itemIndex) as string;

  const response = await chefsApiRequest(ctx, 'GET', `/submissions/${submissionId}`, credentials);
  const inner = validateResponseStructure(ctx, response, itemIndex);

  // A draft is, for example, a submission the submitter has recalled to edit; a deleted submission
  // was deleted in CHEFS. With "stop", no items are returned for either, so downstream nodes do not
  // run and the execution still succeeds. With "route" and "process" they are extracted like any
  // other submission; the caller picks the output.
  const kind: SubmissionKind = inner.deleted === true ? 'deleted' : inner.draft === true ? 'draft' : 'submission';
  const handling = ctx.getNodeParameter('draftDeletedHandling', itemIndex, DRAFT_DELETED_HANDLING.PROCESS) as string;
  if (kind !== 'submission' && handling === DRAFT_DELETED_HANDLING.STOP) {
    return { items: [], kind };
  }

  // When "Get Full Submission Data" is selected, output the entire submission object as-is.
  if (mode === 'fullSubmission') {
    return {
      items: ctx.helpers.constructExecutionMetaData(ctx.helpers.returnJsonArray(inner as unknown as IDataObject), {
        itemData: { item: itemIndex },
      }),
      kind,
    };
  }

  const missingPathBehavior = ctx.getNodeParameter('missingPathBehavior', itemIndex) as string;
  const includeSubmissionMeta = ctx.getNodeParameter('includeSubmissionMeta', itemIndex) as boolean;
  const mappings = parseFieldMappings(ctx, itemIndex);

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

  return {
    items: ctx.helpers.constructExecutionMetaData(ctx.helpers.returnJsonArray(extracted as IDataObject), {
      itemData: { item: itemIndex },
    }),
    kind,
  };
}

/**
 * Handles an error thrown while processing one input item. With "Continue On Fail" it returns an
 * error item for the first output; otherwise it rethrows, wrapping upstream HTTP errors in
 * NodeApiError so n8n shows the API response.
 */
function toErrorItemOrThrow(ctx: IExecuteFunctions, error: unknown, itemIndex: number): INodeExecutionData {
  if (ctx.continueOnFail()) {
    return { json: { error: (error as Error).message }, pairedItem: { item: itemIndex } };
  }
  if (error instanceof NodeOperationError) {
    throw error;
  }
  if ((error as Error & { response?: unknown }).response) {
    throw new NodeApiError(ctx.getNode(), error as unknown as JsonObject);
  }
  throw error;
}

export class CHEFSSubmissionExtractor implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'CHEFS Submission Extractor',
    name: 'chefsSubmissionExtractor',
    description: 'Fetch a CHEFS form submission and extract specific fields using dot-notation path mappings',
    icon: { light: 'file:../../icons/file-search.svg', dark: 'file:../../icons/file-search.dark.svg' },
    group: ['transform'],
    version: 1,
    subtitle: '=Extract fields from submission',
    defaults: {
      name: 'CHEFS Submission Extractor',
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: `={{(${configuredOutputs})($parameter)}}`,
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
          { name: 'Get Full Submission Data', value: 'fullSubmission' },
        ],
        default: 'keyValue',
        description: 'Choose how to define field mappings',
      },
      {
        displayName: 'On Draft / Deleted Submission',
        name: 'draftDeletedHandling',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Process Normally',
            value: DRAFT_DELETED_HANDLING.PROCESS,
            description: 'Treat drafts and deleted submissions like any other submission',
          },
          {
            name: 'Stop (Output Nothing)',
            value: DRAFT_DELETED_HANDLING.STOP,
            description:
              'Output nothing for drafts and deleted submissions, so the workflow stops at this node without an error',
          },
          {
            name: 'Send to Draft / Deleted Output',
            value: DRAFT_DELETED_HANDLING.ROUTE,
            description:
              'Adds "Draft" and "Deleted" outputs; those submissions go there so the workflow can handle them',
          },
        ],
        default: DRAFT_DELETED_HANDLING.PROCESS,
        description:
          'What to do when the submission is a draft (for example one the submitter has recalled to edit) or has been deleted in CHEFS. A deleted draft counts as deleted.',
      },
      {
        displayName: 'Missing Path Behavior',
        name: 'missingPathBehavior',
        type: 'options',
        displayOptions: { show: { fieldMappingMode: ['keyValue', 'json'] } },
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
        displayOptions: { show: { fieldMappingMode: ['keyValue', 'json'] } },
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
    const draftData: INodeExecutionData[] = [];
    const deletedData: INodeExecutionData[] = [];
    const outputFor: Record<SubmissionKind, INodeExecutionData[]> = {
      submission: returnData,
      draft: draftData,
      deleted: deletedData,
    };

    // `draftDeletedHandling` has no expressions, so one value applies to the whole node and matches
    // the outputs built by `configuredOutputs`.
    const route =
      this.getNodeParameter('draftDeletedHandling', 0, DRAFT_DELETED_HANDLING.PROCESS) === DRAFT_DELETED_HANDLING.ROUTE;

    const credentials = (await this.getCredentials('chefsFormAuth')) as unknown as ChefsFormCredentials;

    if (!credentials.formId || !credentials.apiKey) {
      throw new NodeOperationError(this.getNode(), 'CHEFS credentials are incomplete: formId and apiKey are required');
    }

    for (let i = 0; i < items.length; i++) {
      try {
        const { items: executionData, kind } = await processItem(this, i, credentials);
        (route ? outputFor[kind] : returnData).push(...executionData);
      } catch (error) {
        returnData.push(toErrorItemOrThrow(this, error, i));
      }
    }

    return route ? [returnData, draftData, deletedData] : [returnData];
  }
}
