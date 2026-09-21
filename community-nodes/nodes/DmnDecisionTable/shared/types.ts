/**
 * Shared model for the generic DMN Decision Table node.
 * Deliberately project-agnostic: no SIMS or domain-specific concepts here.
 */

export type HitPolicy = 'FIRST' | 'UNIQUE' | 'ANY' | 'PRIORITY' | 'COLLECT' | 'RULE ORDER' | 'OUTPUT ORDER';

export type PrimitiveType = 'string' | 'number' | 'boolean' | 'date' | 'list';

/** COLLECT aggregation (DMN `aggregation` attribute). NONE gathers all hits as lists. */
export type CollectAggregation = 'NONE' | 'SUM' | 'COUNT' | 'MIN' | 'MAX';

export interface TableInput {
  name: string;
  type: PrimitiveType;
  /** Optional input reference, separate from the column label; own-property paths only. */
  expression?: string;
  /**
   * Fixed value for this input. When set (anything except '', null, or
   * undefined — 0 and false still apply), it wins over item lookup and any
   * `expression` path. JSON tables only: constant literals, since the table
   * definition resolves once; use manual inputs for per-item expressions.
   */
  value?: unknown;
}

export interface TableOutput {
  name: string;
  type: PrimitiveType;
}

export interface RuleInputEntry {
  inputName: string;
  /** Cell expression in the locked subset (see cell.ts). Empty means wildcard. */
  expression: string;
}

export interface RuleOutputEntry {
  outputName: string;
  /** Output literal: strict JSON, except string/date outputs also accept bare text. */
  value: string;
}

export interface DecisionRule {
  /** Builder note, mirroring DMN rule descriptions. Never affects matching. */
  description?: string;
  inputEntries: RuleInputEntry[];
  outputEntries: RuleOutputEntry[];
}

export interface DecisionTable {
  decisionId?: string;
  version?: string;
  hitPolicy: HitPolicy;
  /** Only meaningful with hitPolicy COLLECT; defaults to NONE (gather hits as lists). */
  aggregation?: CollectAggregation;
  inputs: TableInput[];
  outputs: TableOutput[];
  rules: DecisionRule[];
  /** Emitted when no rule matches and noMatchBehavior resolves to default. */
  defaultOutput?: Record<string, unknown>;
  /**
   * Ordered output values per output name, highest priority first.
   * Parsed from DMN `<outputValues>`; drives PRIORITY and OUTPUT ORDER.
   * Absent priorities degrade gracefully to rule order.
   */
  outputPriorities?: Record<string, unknown[]>;
}

export const HIT_POLICIES: HitPolicy[] = [
  'FIRST',
  'UNIQUE',
  'ANY',
  'PRIORITY',
  'COLLECT',
  'RULE ORDER',
  'OUTPUT ORDER',
];

export const COLLECT_AGGREGATIONS: CollectAggregation[] = ['NONE', 'SUM', 'COUNT', 'MIN', 'MAX'];

/**
 * Normalizes a hit-policy value from any boundary (DMN XML attribute,
 * JSON table, manual UI) to the canonical vocabulary. Throws on unsupported
 * values so callers fail loudly with the same message everywhere.
 */
export function normalizeHitPolicyValue(raw: unknown): HitPolicy {
  const text = typeof raw === 'string' ? raw : String(raw ?? '');
  const normalized = text
    .trim()
    .toUpperCase()
    .replace(/[_\s]+/g, ' ');
  const mapped = normalized === 'RULEORDER' ? 'RULE ORDER' : normalized === 'OUTPUTORDER' ? 'OUTPUT ORDER' : normalized;
  if ((HIT_POLICIES as string[]).includes(mapped)) return mapped as HitPolicy;
  throw new Error(`Unsupported hit policy "${String(raw)}". Supported: ${HIT_POLICIES.join(', ')}`);
}

/**
 * Normalizes a COLLECT aggregation value from any boundary.
 * Absent/blank means NONE (gather hits as lists).
 */
export function normalizeAggregationValue(raw: unknown): CollectAggregation {
  const text = typeof raw === 'string' ? raw : raw === undefined || raw === null ? '' : String(raw);
  if (text.trim() === '') return 'NONE';
  const normalized = text.trim().toUpperCase();
  if ((COLLECT_AGGREGATIONS as string[]).includes(normalized)) return normalized as CollectAggregation;
  throw new Error(
    `Unsupported COLLECT aggregation "${String(raw)}". Supported: ${COLLECT_AGGREGATIONS.filter((entry) => entry !== 'NONE').join(', ')}`,
  );
}

const UNSAFE_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

export function isSafeName(name: string): boolean {
  return typeof name === 'string' && name.trim() !== '' && !UNSAFE_NAMES.has(name);
}

/** Supported input references: names (including spaces) and dotted context paths. */
export function inputReferencePath(expression: string): string[] {
  if (typeof expression !== 'string') throw new Error('Input expression must be a string');
  const path = expression.split('.').map((part) => part.trim());
  if (path.some((part) => !isSafeName(part) || !/^[\p{L}_][\p{L}\p{M}\p{N}_ ]*$/u.test(part))) {
    throw new Error(`Unsupported input expression "${expression}": use a name or dotted property path`);
  }
  return path;
}

/**
 * Maps a declared type to the PrimitiveType vocabulary. Lenient by design:
 * DMN typeRefs ("integer", "feel:number", "list<string>") and hand-written
 * variants collapse to the closest primitive; anything else becomes string.
 * Declared types are informational only (import fidelity, UI hints) —
 * cell matching never coerces on them — so this never throws.
 */
export function normalizePrimitiveType(raw: unknown): PrimitiveType {
  const normalized = (typeof raw === 'string' ? raw : String(raw ?? 'string'))
    .trim()
    .toLowerCase()
    .replace(/^feel:/, '');
  if (normalized === 'boolean') return 'boolean';
  if (normalized === 'list' || normalized.startsWith('list<') || normalized.startsWith('list(')) return 'list';
  if (
    ['number', 'integer', 'long', 'double', 'decimal'].some(
      (token) => normalized === token || normalized.includes(token),
    )
  ) {
    return 'number';
  }
  if (normalized.includes('date') || normalized.includes('time')) return 'date';
  return 'string';
}

/**
 * Validates the structural integrity of a decision table.
 * Throws a plain Error describing the first problem found.
 */
export function validateTable(table: DecisionTable): void {
  if (!table || typeof table !== 'object' || Array.isArray(table)) {
    throw new Error('Decision table must be an object');
  }
  if (!HIT_POLICIES.includes(table.hitPolicy)) {
    throw new Error(`Unsupported hit policy "${String(table.hitPolicy)}"`);
  }
  if (table.aggregation !== undefined && !COLLECT_AGGREGATIONS.includes(table.aggregation)) {
    throw new Error(`Unsupported COLLECT aggregation "${String(table.aggregation)}"`);
  }
  if (!Array.isArray(table.inputs) || table.inputs.length === 0) {
    throw new Error('Decision table must declare at least one input');
  }
  if (!Array.isArray(table.outputs) || table.outputs.length === 0) {
    throw new Error('Decision table must declare at least one output');
  }
  if (!Array.isArray(table.rules)) {
    throw new Error('Decision table rules must be an array');
  }
  for (const [kind, declarations] of [
    ['input', table.inputs],
    ['output', table.outputs],
  ] as const) {
    for (const declaration of declarations) {
      if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
        throw new Error(`Invalid ${kind} declaration: expected an object`);
      }
    }
  }
  if (
    table.defaultOutput !== undefined &&
    (!table.defaultOutput || typeof table.defaultOutput !== 'object' || Array.isArray(table.defaultOutput))
  ) {
    throw new Error('Decision table defaultOutput must be an object');
  }
  const assertUnique = (names: string[], kind: string): void => {
    const seen = new Set<string>();
    for (const name of names) {
      if (typeof name !== 'string' || !isSafeName(name)) {
        throw new Error(`Invalid ${kind} name "${String(name)}"`);
      }
      if (seen.has(name)) {
        throw new Error(`Duplicate ${kind} name "${name}"`);
      }
      seen.add(name);
    }
  };
  assertUnique(
    table.inputs.map((input) => input.name),
    'input',
  );
  assertUnique(
    table.outputs.map((output) => output.name),
    'output',
  );
  const inputNames = new Set(table.inputs.map((input) => input.name));
  for (const input of table.inputs) {
    if (input.expression !== undefined) inputReferencePath(input.expression);
  }
  const outputNames = new Set(table.outputs.map((output) => output.name));
  for (const key of Object.keys(table.defaultOutput ?? {})) {
    if (!outputNames.has(key)) {
      throw new Error(`defaultOutput references unknown output "${key}"`);
    }
  }
  if (table.outputPriorities !== undefined) {
    if (
      !table.outputPriorities ||
      typeof table.outputPriorities !== 'object' ||
      Array.isArray(table.outputPriorities)
    ) {
      throw new Error('Decision table outputPriorities must be an object mapping output names to value lists');
    }
    for (const [outputName, priorities] of Object.entries(table.outputPriorities)) {
      if (!outputNames.has(outputName)) {
        throw new Error(`outputPriorities references unknown output "${outputName}"`);
      }
      if (!Array.isArray(priorities)) {
        throw new Error(`outputPriorities for output "${outputName}" must be an array`);
      }
    }
  }
  table.rules.forEach((rule, ruleIndex) => {
    if (!rule || typeof rule !== 'object') {
      throw new Error(`Rule ${ruleIndex + 1} must be an object`);
    }
    if (!Array.isArray(rule.inputEntries) || !Array.isArray(rule.outputEntries)) {
      throw new Error(`Rule ${ruleIndex + 1} must have inputEntries and outputEntries arrays`);
    }
    if (rule.description !== undefined && typeof rule.description !== 'string') {
      throw new Error(`Rule ${ruleIndex + 1} description must be a string`);
    }
    const seenInputs = new Set<string>();
    for (const entry of rule.inputEntries) {
      if (!entry || typeof entry !== 'object') {
        throw new Error(`Rule ${ruleIndex + 1} has an invalid input entry`);
      }
      if (!inputNames.has(entry.inputName)) {
        throw new Error(`Rule ${ruleIndex + 1} references unknown input "${entry.inputName}"`);
      }
      if (seenInputs.has(entry.inputName)) {
        throw new Error(`Rule ${ruleIndex + 1} has duplicate entries for input "${entry.inputName}"`);
      }
      seenInputs.add(entry.inputName);
      if (typeof entry.expression !== 'string') {
        throw new Error(`Rule ${ruleIndex + 1} input "${entry.inputName}" expression must be a string`);
      }
    }
    if (rule.outputEntries.length === 0) {
      throw new Error(`Rule ${ruleIndex + 1} must define at least one output entry`);
    }
    const seenOutputs = new Set<string>();
    for (const entry of rule.outputEntries) {
      if (!entry || typeof entry !== 'object') {
        throw new Error(`Rule ${ruleIndex + 1} has an invalid output entry`);
      }
      if (!outputNames.has(entry.outputName)) {
        throw new Error(`Rule ${ruleIndex + 1} references unknown output "${entry.outputName}"`);
      }
      if (seenOutputs.has(entry.outputName)) {
        throw new Error(`Rule ${ruleIndex + 1} has duplicate entries for output "${entry.outputName}"`);
      }
      seenOutputs.add(entry.outputName);
      if (typeof entry.value !== 'string') {
        throw new Error(`Rule ${ruleIndex + 1} output "${entry.outputName}" value must be a string`);
      }
    }
    if (seenOutputs.size !== outputNames.size) {
      throw new Error(`Rule ${ruleIndex + 1} must define every declared output (use null for an empty result)`);
    }
  });
}
