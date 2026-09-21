import {
  NodeConnectionTypes,
  NodeOperationError,
  type IDataObject,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeType,
  type INodeTypeDescription,
} from 'n8n-workflow';
import { parseDmnXml } from './shared/dmnXmlParser';
import { evaluate, parseOutputLiteral } from './shared/evaluator';
import {
  inputReferencePath,
  isSafeName,
  normalizeAggregationValue,
  normalizeHitPolicyValue,
  normalizePrimitiveType,
  validateTable,
  type CollectAggregation,
  type DecisionTable,
  type HitPolicy,
  type PrimitiveType,
} from './shared/types';

type TableSource = 'manual' | 'json' | 'dmnXml';
type OutputMode = 'merge' | 'single' | 'envelope';
type NoMatchBehavior = 'default' | 'error' | 'null';

interface ManualInputParam {
  name?: string;
  type?: PrimitiveType;
  /** Per-item value override; empty means read from the incoming item JSON. */
  value?: unknown;
}

interface ManualOutputParam {
  name?: string;
  type?: PrimitiveType;
}

interface ManualCellParam {
  inputName?: string;
  expression?: string;
}

interface ManualResultParam {
  outputName?: string;
  value?: string;
}

interface ManualRuleRow {
  description?: string;
  inputEntries?: { values?: ManualCellParam[] };
  outputEntries?: { values?: ManualResultParam[] };
}

export class DmnDecisionTable implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'DMN Decision Table',
    name: 'dmnDecisionTable',
    description:
      'Evaluate a DMN-style decision table (FIRST, UNIQUE, ANY, PRIORITY, COLLECT, RULE ORDER, OUTPUT ORDER) against each item',
    icon: {
      light: 'file:../../icons/dmn-decision-table.svg',
      dark: 'file:../../icons/dmn-decision-table.dark.svg',
    },
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["decisionId"] || "Decision table"}}',
    defaults: { name: 'DMN Decision Table' },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    properties: [
      {
        displayName: 'Table Source',
        name: 'tableSource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Build Manually', value: 'manual', description: 'Define inputs, outputs and rules in the node UI' },
          { name: 'JSON', value: 'json', description: 'Provide the full table as JSON' },
          { name: 'DMN XML', value: 'dmnXml', description: 'Paste DMN 1.x XML and select a decision to import' },
        ],
        default: 'manual',
        description: 'Where the decision table definition comes from',
      },
      {
        displayName: 'Decision ID',
        name: 'decisionId',
        type: 'string',
        default: '',
        placeholder: 'e.g. discountBand',
        description:
          'Label for this decision, shown in the subtitle. Also selects the decision when Table Source is DMN XML.',
      },
      {
        displayName: 'Table Version',
        name: 'tableVersion',
        type: 'string',
        default: '',
        placeholder: 'e.g. v1.2',
        description: 'Optional version label. Informational only.',
      },
      {
        displayName: 'Hit Policy',
        name: 'hitPolicy',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { tableSource: ['manual'] } },
        options: [
          { name: 'FIRST — First Match Wins', value: 'FIRST', description: 'First matching rule in table order wins' },
          { name: 'UNIQUE — At Most One Match', value: 'UNIQUE', description: 'Fails when more than one rule matches' },
          {
            name: 'ANY — All Matches Must Agree',
            value: 'ANY',
            description: 'Fails when matching rules disagree on outputs',
          },
          {
            name: 'PRIORITY — Highest-Priority Match Wins',
            value: 'PRIORITY',
            description: 'Needs outputPriorities (JSON/DMN XML with outputValues); otherwise behaves like FIRST',
          },
          {
            name: 'COLLECT — Gather All Matches',
            value: 'COLLECT',
            description: 'Gathers outputs as lists, or aggregates them with Collect Aggregation',
          },
          {
            name: 'RULE ORDER — Matches in Rule Order',
            value: 'RULE ORDER',
            description: 'Gathers outputs as lists in rule order',
          },
          {
            name: 'OUTPUT ORDER — Matches in Output Priority Order',
            value: 'OUTPUT ORDER',
            description: 'Needs outputPriorities (JSON/DMN XML with outputValues); otherwise behaves like RULE ORDER',
          },
        ],
        default: 'FIRST',
        description: 'How multiple matching rules are resolved',
      },
      {
        displayName: 'Collect Aggregation',
        name: 'collectAggregation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { tableSource: ['manual'], hitPolicy: ['COLLECT'] } },
        options: [
          { name: 'None — Gather Matches as Lists', value: 'NONE' },
          { name: 'Sum', value: 'SUM' },
          { name: 'Count', value: 'COUNT' },
          { name: 'Minimum', value: 'MIN' },
          { name: 'Maximum', value: 'MAX' },
        ],
        default: 'NONE',
        description: 'How COLLECT combines the outputs of matching rules (DMN aggregation)',
      },
      {
        displayName: 'Inputs',
        name: 'inputs',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true, sortable: true },
        default: {},
        placeholder: 'Add Input',
        displayOptions: { show: { tableSource: ['manual'] } },
        description: 'Decision inputs, read from the item JSON by name unless Value is set',
        options: [
          {
            name: 'definitions',
            displayName: 'Input',
            values: [
              {
                displayName: 'Name',
                name: 'name',
                type: 'string',
                default: '',
                required: true,
                description: 'Item JSON field name, e.g. status',
              },
              {
                displayName: 'Value',
                name: 'value',
                type: 'string',
                default: '',
                description:
                  'Value for this input. Leave empty to read from the incoming item JSON by Name. Accepts constants and expressions (e.g. {{ $json.customer.status }}); falsy values like 0 and false still apply.',
              },
              {
                displayName: 'Type',
                name: 'type',
                type: 'options',
                noDataExpression: true,
                description: 'Informational only; matching does not coerce values by type',
                options: [
                  { name: 'String', value: 'string' },
                  { name: 'Number', value: 'number' },
                  { name: 'Boolean', value: 'boolean' },
                  { name: 'Date', value: 'date' },
                  { name: 'List', value: 'list' },
                ],
                default: 'string',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Outputs',
        name: 'outputs',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true, sortable: true },
        default: {},
        placeholder: 'Add Output',
        displayOptions: { show: { tableSource: ['manual'] } },
        description: 'Decision outputs, written to each item',
        options: [
          {
            name: 'definitions',
            displayName: 'Output',
            values: [
              {
                displayName: 'Name',
                name: 'name',
                type: 'string',
                default: '',
                required: true,
                description: 'Output field name, e.g. tier',
              },
              {
                displayName: 'Type',
                name: 'type',
                type: 'options',
                noDataExpression: true,
                description: 'Informational only; matching does not coerce values by type',
                options: [
                  { name: 'String', value: 'string' },
                  { name: 'Number', value: 'number' },
                  { name: 'Boolean', value: 'boolean' },
                  { name: 'Date', value: 'date' },
                  { name: 'List', value: 'list' },
                ],
                default: 'string',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Rules',
        name: 'rules',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true, sortable: true },
        default: {},
        placeholder: 'Add Rule',
        displayOptions: { show: { tableSource: ['manual'] } },
        description: 'Rules are evaluated top to bottom. Empty cells match anything.',
        options: [
          {
            name: 'entries',
            displayName: 'Rule',
            values: [
              {
                displayName: 'Description',
                name: 'description',
                type: 'string',
                default: '',
                placeholder: 'e.g. why this rule exists',
                description:
                  'Note for builders, like DMN rule annotations. Informational only; never affects matching.',
              },
              {
                displayName: 'Input Entries',
                name: 'inputEntries',
                type: 'fixedCollection',
                typeOptions: { multipleValues: true },
                default: {},
                placeholder: 'Add Input Entry',
                options: [
                  {
                    name: 'values',
                    displayName: 'Input Entry',
                    values: [
                      { displayName: 'Input Name', name: 'inputName', type: 'string', default: '', required: true },
                      {
                        displayName: 'Expression',
                        name: 'expression',
                        type: 'string',
                        default: '',
                        placeholder: 'e.g. "gold", >0, [1..10], "a","b", not("x")',
                        description:
                          'Cell expression: =, >, ranges [a..b], lists "a","b", not(...). Empty matches anything. Quote literals containing and/or; anything else throws.',
                      },
                    ],
                  },
                ],
              },
              {
                displayName: 'Output Entries',
                name: 'outputEntries',
                type: 'fixedCollection',
                typeOptions: { multipleValues: true },
                default: {},
                placeholder: 'Add Output Entry',
                options: [
                  {
                    name: 'values',
                    displayName: 'Output Entry',
                    values: [
                      { displayName: 'Output Name', name: 'outputName', type: 'string', default: '', required: true },
                      {
                        displayName: 'Value',
                        name: 'value',
                        type: 'string',
                        default: '',
                        placeholder: 'e.g. premium, 0, true',
                        description:
                          'Value assigned when the rule matches. Parsed as JSON; string and date outputs also accept bare text without quotes.',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        displayName: 'Table JSON',
        name: 'tableJson',
        type: 'json',
        default: '{}',
        displayOptions: { show: { tableSource: ['json'] } },
        description:
          'Full decision table: { hitPolicy, inputs, outputs, rules, defaultOutput?, aggregation?, outputPriorities? }',
      },
      {
        displayName: 'DMN XML',
        name: 'dmnXml',
        type: 'string',
        typeOptions: { rows: 20 },
        default: '',
        placeholder: 'Paste DMN 1.x XML containing a decisionTable…',
        displayOptions: { show: { tableSource: ['dmnXml'] } },
        description: 'DMN XML source. The decision matching Decision ID is imported (first decision when blank).',
      },
      {
        displayName: 'Default Output Entries',
        name: 'defaultOutputs',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true, sortable: true },
        default: {},
        placeholder: 'Add Default Output',
        displayOptions: { show: { tableSource: ['manual'] } },
        description:
          'Emitted when no rule matches and No Match Behavior is Use Default Output. Entries override the table embedded defaultOutput; when empty, a set Default Output (JSON) still applies. Values parse like rule output values against each declared output type.',
        options: [
          {
            name: 'definitions',
            displayName: 'Default Output',
            values: [
              {
                displayName: 'Output Name',
                name: 'outputName',
                type: 'string',
                default: '',
                required: true,
                description: 'Declared output field name, e.g. tier',
              },
              {
                displayName: 'Value',
                name: 'value',
                type: 'string',
                default: '',
                placeholder: 'e.g. 0, none, true',
                description:
                  'Default value, parsed like rule output values (bare text needs no quotes for string outputs). Supports expressions, resolved per item.',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Default Output (JSON)',
        name: 'defaultOutput',
        type: 'json',
        default: '{}',
        displayOptions: { show: { tableSource: ['json', 'dmnXml'] } },
        description:
          'Emitted when no rule matches and No Match Behavior is Use Default Output. A non-empty value here overrides the table embedded defaultOutput; when empty, fitting Default Output Entries still apply. Supports expressions (resolved per item).',
      },
      {
        displayName: 'No Match Behavior',
        name: 'noMatchBehavior',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Use Default Output', value: 'default', description: 'Emit the default output (or empty result)' },
          { name: 'Null Outputs', value: 'null', description: 'Set every declared output to null' },
          { name: 'Throw Error', value: 'error', description: 'Fail the item when no rule matches' },
        ],
        default: 'default',
        description: 'What to do when no rule matches an item',
      },
      {
        displayName: 'Output Mode',
        name: 'outputMode',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Single Result Key',
            value: 'single',
            description: 'Nest results under Result Key (empty key merges instead)',
          },
          {
            name: 'Merge Into Item',
            value: 'merge',
            description: 'Spread result fields into the item JSON (Result Key ignored)',
          },
          {
            name: 'Envelope With Metadata',
            value: 'envelope',
            description: 'Nest the whole envelope under Result Key (empty key merges instead)',
          },
        ],
        default: 'merge',
        description: 'How decision outputs are written to each item',
      },
      {
        displayName: 'Result Key',
        name: 'resultKey',
        type: 'string',
        default: '',
        placeholder: 'e.g. decision',
        displayOptions: { show: { outputMode: ['single', 'envelope'] } },
        description:
          'Nest results under this key (the whole envelope in envelope mode). Leave empty to merge into the item instead. Replaces any existing field with the same name.',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    if (items.length === 0) return [[]];
    let table: DecisionTable;
    try {
      table = buildTable(this);
    } catch (error) {
      throw new NodeOperationError(this.getNode(), error as Error);
    }

    // Table definition params are static (noDataExpression); per-item values
    // below still resolve each item's expressions independently.
    const tableSource = this.getNodeParameter('tableSource', 0, 'manual') as TableSource;

    const returnData: INodeExecutionData[] = [];
    for (const [itemIndex, item] of items.entries()) {
      try {
        // Per-item parameters so expressions can vary per item.
        const outputMode = this.getNodeParameter('outputMode', itemIndex, 'merge') as OutputMode;
        const resultKey = (this.getNodeParameter('resultKey', itemIndex, '') as string).trim();
        const noMatchBehavior = this.getNodeParameter('noMatchBehavior', itemIndex, 'default') as NoMatchBehavior;
        // An empty Result Key always merges into the item; otherwise the mode
        // decides the shape (single nests outputs, envelope nests everything).
        const effectiveMode: OutputMode = resultKey === '' ? 'merge' : outputMode;
        if (effectiveMode !== 'merge' && !isSafeName(resultKey)) {
          throw new Error(`Invalid Result Key "${resultKey}"`);
        }
        // Each source prefers its own default, then falls back to the other
        // form so configured defaults survive source switches: manual reads
        // Default Output Entries (strict), JSON/XML read the Default Output
        // JSON parameter. Anything set overrides the embedded default;
        // otherwise it applies. Node defaults never enter the shared table.
        const defaultOutput = resolveEffectiveDefault(this, itemIndex, table, tableSource);
        const itemJson = (item.json ?? {}) as Record<string, unknown>;
        // Fixed per-input values override item lookup: manual Values resolve
        // per item (constants or expressions), JSON values are static
        // constants from the table definition. DMN XML declares no values.
        const candidates =
          tableSource === 'manual'
            ? readCollection<ManualInputParam>(this, itemIndex, 'inputs', 'definitions')
            : table.inputs;
        const values = applyInputValues(table, itemJson, candidates);
        const { output, matchedRuleIndexes } = evaluate({ ...table, defaultOutput }, values);
        let resolved = output;
        if (matchedRuleIndexes.length === 0) {
          resolved = resolveNoMatch(table, noMatchBehavior, output);
        }
        // Outputs always land on the original item, never on reshaped values.
        const json = formatOutput(effectiveMode, itemJson, resultKey, table, resolved);
        const executionData = this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(json), {
          itemData: { item: itemIndex },
        });
        returnData.push(...executionData);
      } catch (error) {
        // Everything thrown inside the loop is per-item by construction
        // (the table itself was already built and validated before the loop),
        // so continueOnFail can recover uniformly without message sniffing.
        if (!this.continueOnFail()) {
          throw error instanceof NodeOperationError
            ? error
            : new NodeOperationError(this.getNode(), error as Error, { itemIndex });
        }
        const executionData = this.helpers.constructExecutionMetaData(
          this.helpers.returnJsonArray({ error: (error as Error).message }),
          { itemData: { item: itemIndex } },
        );
        returnData.push(...executionData);
      }
    }
    return [returnData];
  }
}

/**
 * Resolves the output when no rule matched.
 * Module-level (not a class method) so plain-object execution contexts
 * used in tests can drive execute() without private-method binding.
 */
function resolveNoMatch(
  table: DecisionTable,
  behavior: NoMatchBehavior,
  output: Record<string, unknown>,
): Record<string, unknown> {
  if (behavior === 'error') {
    throw new Error('No rule matched this item and No Match Behavior is Throw Error');
  }
  if (behavior === 'null') {
    const nulled: Record<string, unknown> = {};
    for (const declared of table.outputs) {
      nulled[declared.name] = null;
    }
    return nulled;
  }
  return output;
}

/**
 * Resolves the no-match default for one item of a manual table. Default
 * Output Entries (values parsed like rule output values against each
 * declared output type) override the table embedded defaultOutput; an empty
 * list falls back to it. Entry names must reference declared outputs,
 * exactly once each.
 */
function buildDefaultEntries(defs: ManualResultParam[], table: DecisionTable): Record<string, unknown> {
  const types = new Map(table.outputs.map((declared) => [declared.name, declared.type]));
  const seen = new Set<string>();
  const result: Record<string, unknown> = {};
  defs.forEach((def, index) => {
    const name = (def?.outputName ?? '').trim();
    if (name === '' || !types.has(name)) {
      throw new Error(`Default output entry ${index + 1} references unknown output "${def?.outputName ?? ''}"`);
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate default output entry for output "${name}"`);
    }
    seen.add(name);
    result[name] = parseOutputLiteral(def?.value ?? '', name, 0, types.get(name), `Default output "${name}"`);
  });
  return result;
}

/** Best-effort reuse of entries configured for another source: applies only when every entry fits the current table, otherwise ignored. */
function tryForeignDefaultEntries(
  context: IExecuteFunctions,
  itemIndex: number,
  table: DecisionTable,
): Record<string, unknown> | undefined {
  const defs = readCollection<ManualResultParam>(context, itemIndex, 'defaultOutputs', 'definitions');
  if (defs.length === 0) return undefined;
  try {
    return buildDefaultEntries(defs, table);
  } catch {
    return undefined;
  }
}

function resolveEffectiveDefault(
  context: IExecuteFunctions,
  itemIndex: number,
  table: DecisionTable,
  tableSource: TableSource,
): Record<string, unknown> {
  if (tableSource === 'manual') {
    const defs = readCollection<ManualResultParam>(context, itemIndex, 'defaultOutputs', 'definitions');
    if (defs.length > 0) return buildDefaultEntries(defs, table);
    const legacy = parseJsonParameter(context, itemIndex, 'defaultOutput', {});
    if (Object.keys(legacy).length > 0) return legacy;
    return table.defaultOutput ?? {};
  }
  const nodeDefaultOutput = parseJsonParameter(context, itemIndex, 'defaultOutput', {});
  if (Object.keys(nodeDefaultOutput).length > 0) return nodeDefaultOutput;
  return tryForeignDefaultEntries(context, itemIndex, table) ?? table.defaultOutput ?? {};
}

/**
 * Shapes the per-item result onto the original item JSON. Merge spreads
 * outputs into the item; single nests them under Result Key; envelope nests
 * the whole envelope (decision ID, table version, outputs under `data`)
 * under Result Key. Nested keys replace same-named item fields. Callers map
 * an empty Result Key to merge before calling, so the key is always usable.
 */
function formatOutput(
  outputMode: OutputMode,
  itemJson: Record<string, unknown>,
  resultKey: string,
  table: DecisionTable,
  resolved: Record<string, unknown>,
): IDataObject {
  if (outputMode === 'envelope') {
    const envelope = { decisionId: table.decisionId, tableVersion: table.version, data: resolved };
    return { ...itemJson, [resultKey]: envelope } as IDataObject;
  }
  if (outputMode === 'single') {
    return { ...itemJson, [resultKey]: resolved } as IDataObject;
  }
  return { ...itemJson, ...resolved } as IDataObject;
}

function parseJsonParameter(
  context: IExecuteFunctions,
  itemIndex: number,
  name: string,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  const raw = context.getNodeParameter(name, itemIndex, '') as unknown;
  if (raw === '' || raw === undefined || raw === null) return fallback;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string') {
    throw new Error(`The "${name}" field must be a JSON object`);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`The "${name}" field must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('The "')) throw error;
    throw new Error(`The "${name}" field contains invalid JSON: ${(error as Error).message}`, { cause: error });
  }
}

/**
 * Reads a fixedCollection parameter, tolerating both the real n8n shape
 * (getNodeParameter(name) -> { optionName: rows }) and flat dotted access.
 */
function readCollection<T>(context: IExecuteFunctions, itemIndex: number, name: string, option: string): T[] {
  const direct = context.getNodeParameter(`${name}.${option}`, itemIndex, undefined) as T[] | undefined;
  if (Array.isArray(direct)) return direct;
  const collection = context.getNodeParameter(name, itemIndex, {}) as Record<string, unknown>;
  const rows = collection?.[option];
  if (Array.isArray(rows)) return rows as T[];
  return [];
}

/**
 * Writes a fixed value at an input reference path, cloning plain objects
 * along the way so the incoming item is never mutated. Path segments are
 * pre-validated safe by inputReferencePath.
 */
function setPathValue(root: Record<string, unknown>, path: string[], value: unknown): void {
  let current = root;
  for (let index = 0; index < path.length - 1; index++) {
    const next = current[path[index]];
    if (
      next !== null &&
      typeof next === 'object' &&
      !Array.isArray(next) &&
      Object.getPrototypeOf(next) === Object.prototype
    ) {
      current[path[index]] = { ...(next as Record<string, unknown>) };
    } else {
      current[path[index]] = {};
    }
    current = current[path[index]] as Record<string, unknown>;
  }
  current[path[path.length - 1]] = value;
}

/**
 * Overlays fixed input values onto the incoming item JSON for one item.
 * Candidates come from per-item manual definitions or static JSON inputs;
 * either way only declared inputs are overridden (matched by name), so
 * stray rows can never inject undeclared fields. A set value wins over both
 * item lookup and any `expression` path (written at that path). Empty values
 * ('', null, undefined) fall back to item lookup; falsy-but-set values
 * (0, false) still apply. Returns the original object untouched when no
 * input defines a value.
 */
function applyInputValues(
  table: DecisionTable,
  itemJson: Record<string, unknown>,
  candidates: Array<{ name?: unknown; value?: unknown }>,
): Record<string, unknown> {
  const byName = new Map(
    candidates.map((candidate) => [typeof candidate?.name === 'string' ? candidate.name.trim() : '', candidate?.value]),
  );
  let values = itemJson;
  let cloned = false;
  const editable = (): Record<string, unknown> => {
    if (!cloned) {
      values = { ...itemJson };
      cloned = true;
    }
    return values;
  };
  for (const input of table.inputs) {
    const value = byName.get(input.name);
    if (value === '' || value === undefined || value === null) continue;
    if (input.expression === undefined) {
      editable()[input.name] = value;
    } else {
      setPathValue(editable(), inputReferencePath(input.expression), value);
    }
  }
  return values;
}

/** Reject malformed lists; silently replacing input tests with [] would make a wildcard. */
function asRowArray<T>(value: T[] | undefined): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Rule entry values must be an array');
  return value;
}

function buildTable(context: IExecuteFunctions): DecisionTable {
  const source = context.getNodeParameter('tableSource', 0, 'manual') as TableSource;
  const decisionId = (context.getNodeParameter('decisionId', 0, '') as string).trim() || undefined;
  const tableVersion = (context.getNodeParameter('tableVersion', 0, '') as string).trim() || undefined;

  if (source === 'json') {
    const parsed = parseJsonParameter(context, 0, 'tableJson', {});
    if (Object.keys(parsed).length === 0) {
      throw new Error('Table JSON must not be empty: paste the full decision table');
    }
    const table = parsed as unknown as DecisionTable;
    const merged: DecisionTable = {
      ...table,
      decisionId: table.decisionId ?? decisionId,
      version: table.version ?? tableVersion,
      // Tolerate hand-written JSON (e.g. lowercase "collect", DMN-ish
      // "integer" types); the per-item loop resolves defaultOutput, so the
      // embedded value is kept as-is here.
      hitPolicy: normalizeHitPolicyValue(table.hitPolicy),
      aggregation: table.aggregation === undefined ? undefined : normalizeAggregationValue(table.aggregation),
      inputs: (Array.isArray(table.inputs) ? table.inputs : []).map((input) => ({
        ...input,
        type: normalizePrimitiveType((input as { type?: unknown } | null)?.type),
        // Static constant only: the JSON definition resolves once, so
        // per-item expressions belong in manual Input Values instead.
        value: (input as { value?: unknown } | null)?.value,
      })),
      outputs: (Array.isArray(table.outputs) ? table.outputs : []).map((output) => ({
        ...output,
        type: normalizePrimitiveType((output as { type?: unknown } | null)?.type),
      })),
    };
    validateTable(merged);
    return merged;
  }

  if (source === 'dmnXml') {
    const xml = context.getNodeParameter('dmnXml', 0, '') as string;
    const parsed = parseDmnXml(xml, decisionId);
    const merged: DecisionTable = {
      ...parsed,
      decisionId: parsed.decisionId ?? decisionId,
      version: parsed.version ?? tableVersion,
    };
    validateTable(merged);
    return merged;
  }

  if (source !== 'manual') {
    throw new Error(`Unsupported table source "${source}"`);
  }

  const hitPolicy = context.getNodeParameter('hitPolicy', 0, 'FIRST') as HitPolicy;
  const aggregation = context.getNodeParameter('collectAggregation', 0, 'NONE') as CollectAggregation;
  // fixedCollection params arrive as { <optionName>: [...] }; unwrap defensively
  // so both real n8n (getNodeParameter('inputs') -> object) and flat test
  // contexts (getNodeParameter('inputs.definitions') -> array) work.
  const rawInputs = readCollection<ManualInputParam>(context, 0, 'inputs', 'definitions');
  const rawOutputs = readCollection<ManualOutputParam>(context, 0, 'outputs', 'definitions');
  const rawRules = readCollection<ManualRuleRow>(context, 0, 'rules', 'entries');

  const inputs = rawInputs.map((entry) => {
    const row = entry ?? {};
    return {
      name: (row.name ?? '').trim(),
      type: normalizePrimitiveType(row.type ?? 'string'),
    };
  });
  const outputs = rawOutputs.map((entry) => {
    const row = entry ?? {};
    return {
      name: (row.name ?? '').trim(),
      type: normalizePrimitiveType(row.type ?? 'string'),
    };
  });

  // Fixed-collection rows arrive as arrays of row objects; map them directly.
  // Malformed rows degrade to empty entries so validateTable reports them
  // loudly instead of throwing TypeErrors here.
  const mappedRules = rawRules.map((rule: ManualRuleRow) => {
    const row = rule ?? {};
    const descriptionText = typeof row.description === 'string' ? row.description.trim() : '';
    const inputRows = asRowArray<ManualCellParam>(row.inputEntries?.values);
    const outputRows = asRowArray<ManualResultParam>(row.outputEntries?.values);
    return {
      ...(descriptionText ? { description: descriptionText } : {}),
      inputEntries: inputRows.map((cell) => {
        const cellRow = cell ?? {};
        return {
          inputName: (cellRow.inputName ?? '').trim(),
          expression: cellRow.expression ?? '',
        };
      }),
      outputEntries: outputRows.map((cell) => {
        const cellRow = cell ?? {};
        return {
          outputName: (cellRow.outputName ?? '').trim(),
          value: cellRow.value ?? '',
        };
      }),
    };
  });

  const table: DecisionTable = {
    decisionId,
    version: tableVersion,
    hitPolicy,
    aggregation,
    inputs,
    outputs,
    rules: mappedRules,
  };
  validateTable(table);
  return table;
}
