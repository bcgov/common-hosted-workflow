import { XMLParser } from 'fast-xml-parser';
import { splitTopLevel } from './cell';
import type { DecisionTable } from './types';
import {
  isSafeName,
  inputReferencePath,
  normalizeAggregationValue,
  normalizeHitPolicyValue,
  normalizePrimitiveType,
  validateTable,
} from './types';

interface RawEntry {
  text?: unknown;
}

interface RawRule {
  /** DMN rule description; BPMN tools render this as the annotations column. */
  description?: unknown;
  inputEntry?: RawEntry | RawEntry[];
  outputEntry?: RawEntry | RawEntry[];
}

interface RawInput {
  '@_label'?: string;
  '@_name'?: string;
  inputExpression?: RawEntry & { '@_typeRef'?: string; '@_label'?: string };
}

interface RawOutput {
  '@_label'?: string;
  '@_name'?: string;
  '@_typeRef'?: string;
  outputValues?: RawEntry;
}

interface RawDecisionTable {
  '@_hitPolicy'?: string;
  '@_hitpolicy'?: string;
  '@_aggregation'?: string;
  input?: RawInput | RawInput[];
  output?: RawOutput | RawOutput[];
  rule?: RawRule | RawRule[];
}

interface RawDecision {
  '@_id'?: string;
  '@_name'?: string;
  decisionTable?: RawDecisionTable;
}

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: false,
  // BPMN tools (e.g. Camunda Modeler) export namespaced XML
  // (<dmn:definitions>, <dmn:decision>, ...); strip prefixes so both
  // prefixed and default-namespace documents parse identically.
  removeNSPrefix: true,
} as const;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function entryText(entry: RawEntry | undefined, context: string): string {
  const text = entry?.text;
  if (text === undefined || text === null) return '';
  if (typeof text === 'string' || typeof text === 'number' || typeof text === 'boolean') {
    return String(text);
  }
  // Nested markup is not evaluable; failing loudly beats silently
  // treating the cell as a wildcard (which would match everything).
  throw new Error(`Unsupported ${context}: nested content cannot be evaluated as a cell expression`);
}

function inputExpressionText(input: RawInput | undefined, context: string): string {
  const expression = input?.inputExpression;
  if (typeof expression === 'string') return expression;
  return entryText(expression, context);
}

/**
 * Reads an optional human text element such as a rule description.
 * Plain strings pass through; nested markup fails loudly like cell content.
 */
function optionalText(raw: unknown, context: string): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') return raw;
  return entryText({ text: raw }, context);
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

/**
 * Picks a usable field name from tool-provided candidates.
 * Prefers clean identifiers (the FEEL variable reference), then human
 * labels, then any other usable raw name. This selects the column label;
 * its input expression is preserved separately for evaluation.
 */
function pickName(
  identifierCandidates: Array<string | undefined>,
  rawCandidates: Array<string | undefined>,
  fallback: string,
): string {
  const clean = (candidates: Array<string | undefined>): string[] =>
    candidates.map((candidate) => (candidate ?? '').trim()).filter((candidate) => candidate !== '');
  return (
    clean(identifierCandidates).find((candidate) => isIdentifier(candidate) && isSafeName(candidate)) ??
    clean(rawCandidates).find((candidate) => isSafeName(candidate)) ??
    fallback
  );
}

/** Parses one `<outputValues>` literal; unquoted values fall back to strings. */
function parsePriorityLiteral(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function parseDefinitions(xml: string): Record<string, unknown> {
  if (!xml || xml.trim() === '') {
    throw new Error('DMN XML must not be empty');
  }
  if (xml.length > 5_000_000) throw new Error('DMN XML exceeds the 5,000,000 character limit');
  // DMN imports do not need DTDs. Refuse them before entity processing.
  if (/<!DOCTYPE\s/i.test(xml)) throw new Error('DMN XML DOCTYPE declarations are not supported');
  let parsed: unknown;
  try {
    parsed = new XMLParser(PARSER_OPTIONS).parse(xml, true);
  } catch (error) {
    throw new Error(`Invalid DMN XML: ${(error as Error).message}`, { cause: error });
  }
  const raw = (parsed as Record<string, unknown>)?.definitions;
  if (raw === undefined || raw === null) {
    throw new Error('Invalid DMN XML: missing definitions element');
  }
  // With namespace-prefix stripping, an empty <definitions> element (no child
  // decisions) parses to "" instead of an attribute object; normalize it so
  // callers report "no decision elements found".
  const definitions = (typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return definitions;
}

function readDecisions(definitions: Record<string, unknown>): RawDecision[] {
  return asArray(definitions.decision as RawDecision | RawDecision[] | undefined);
}

/**
 * Parses DMN 1.x XML into the generic DecisionTable model.
 * Selects the decision matching decisionId, or the first decision when omitted.
 * Only decisionTable-based decisions are supported; literal expressions and
 * contexts throw a descriptive error.
 */
export function parseDmnXml(xml: string, decisionId?: string): DecisionTable {
  const definitions = parseDefinitions(xml);
  const decisions = readDecisions(definitions);
  if (decisions.length === 0) {
    throw new Error('Invalid DMN XML: no decision elements found');
  }
  const wanted = (decisionId ?? '').trim();
  const decision =
    wanted !== ''
      ? decisions.find((candidate) => candidate['@_id'] === wanted || candidate['@_name'] === wanted)
      : decisions[0];
  if (!decision) {
    throw new Error(
      `DMN decision "${wanted}" not found. Available: ${decisions.map((candidate) => candidate['@_id'] ?? candidate['@_name'] ?? '?').join(', ')}`,
    );
  }
  const tableXml = decision.decisionTable;
  if (!tableXml) {
    throw new Error(
      `DMN decision "${decision['@_id'] ?? decision['@_name']}" has no decisionTable (only decision tables are supported)`,
    );
  }

  const rawInputs = asArray(tableXml.input);
  const rawOutputs = asArray(tableXml.output);
  const inputs = rawInputs.map((input, index) => {
    // The inputExpression text is the FEEL variable reference (e.g. `age`);
    // fall back to display labels, then to any usable raw name.
    const expression = input?.inputExpression;
    const expressionLabel = typeof expression === 'string' ? undefined : expression?.['@_label'];
    const expressionText = inputExpressionText(input, `input ${index + 1}`);
    if (expressionText !== '') inputReferencePath(expressionText);
    const name = pickName(
      [expressionText, input?.['@_label'], expressionLabel, input?.['@_name']],
      [input?.['@_label'], expressionLabel, input?.['@_name'], expressionText],
      `input${index + 1}`,
    );
    return {
      name,
      type: normalizePrimitiveType(typeof expression === 'string' ? undefined : expression?.['@_typeRef']),
      ...(expressionText && (expressionText !== name || expressionText.includes('.'))
        ? { expression: expressionText }
        : {}),
    };
  });
  const outputs = rawOutputs.map((output, index) => {
    // An explicit output name is semantic; never replace it with a label.
    const name = output?.['@_name']?.trim() || output?.['@_label']?.trim() || `output${index + 1}`;
    if (!isSafeName(name)) throw new Error(`Invalid output name "${name}"`);
    return {
      name,
      type: normalizePrimitiveType(output?.['@_typeRef']),
    };
  });
  const outputPriorities: Record<string, unknown[]> = {};
  rawOutputs.forEach((output, index) => {
    const valuesText = entryText(output.outputValues, `outputValues of output ${index + 1}`).trim();
    if (valuesText === '') return;
    outputPriorities[outputs[index].name] = splitTopLevel(valuesText, ',')
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .map(parsePriorityLiteral);
  });

  const rules = asArray(tableXml.rule).map((rule, ruleIndex) => {
    const inputCells = asArray(rule.inputEntry);
    const outputCells = asArray(rule.outputEntry);
    // XML cells are positional: missing cells cannot safely become wildcards.
    if (inputCells.length > inputs.length) {
      throw new Error(`Rule ${ruleIndex + 1} has more input entries than declared inputs`);
    }
    if (outputCells.length > outputs.length) {
      throw new Error(`Rule ${ruleIndex + 1} has more output entries than declared outputs`);
    }
    if (inputCells.length !== inputs.length) {
      throw new Error(`Rule ${ruleIndex + 1} input entries must match the declared input count`);
    }
    if (outputCells.length !== outputs.length) {
      throw new Error(`Rule ${ruleIndex + 1} output entries must match the declared output count`);
    }
    const description = optionalText(rule.description, `rule ${ruleIndex + 1} description`);
    return {
      ...(description ? { description } : {}),
      inputEntries: inputs.map((input, index) => ({
        inputName: input.name,
        expression: entryText(inputCells[index], `rule ${ruleIndex + 1} input "${input.name}"`),
      })),
      outputEntries: outputs.map((output, index) => ({
        outputName: output.name,
        value: entryText(outputCells[index], `rule ${ruleIndex + 1} output "${output.name}"`),
      })),
    };
  });

  const table: DecisionTable = {
    decisionId: decision['@_id'] ?? decision['@_name'],
    hitPolicy: normalizeHitPolicyValue(tableXml['@_hitPolicy'] ?? tableXml['@_hitpolicy'] ?? 'UNIQUE'),
    aggregation: normalizeAggregationValue(tableXml['@_aggregation']),
    inputs,
    outputs,
    rules,
  };
  if (Object.keys(outputPriorities).length > 0) {
    table.outputPriorities = outputPriorities;
  }
  validateTable(table);
  return table;
}

/**
 * Lists decision ids/names found in DMN XML (for error messages and UI hints).
 */
export function listDmnDecisions(xml: string): string[] {
  const decisions = readDecisions(parseDefinitions(xml));
  return decisions.map((decision) => decision['@_id'] ?? decision['@_name'] ?? '?');
}
