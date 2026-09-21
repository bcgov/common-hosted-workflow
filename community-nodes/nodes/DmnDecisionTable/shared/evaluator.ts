import { matchesCell } from './cell';
import {
  inputReferencePath,
  validateTable,
  type CollectAggregation,
  type DecisionRule,
  type DecisionTable,
  type PrimitiveType,
} from './types';

export interface EvaluationResult {
  matchedRuleIndexes: number[];
  output: Record<string, unknown>;
}

/**
 * Parses an output cell against its declared output type. Values parse as
 * JSON, except `string`/`date` outputs also accept bare text without quotes
 * (`gold` works like `"gold"`). `null` passes for every type, and plain
 * objects pass through (the type vocabulary has no object member).
 * Anything else that does not fit the declared type throws loudly.
 * Without a declared type the value passes as any finite JSON literal.
 */
export function parseOutputLiteral(
  raw: string,
  outputName: string,
  ruleIndex: number,
  outputType?: PrimitiveType,
  contextLabel?: string,
): unknown {
  const label = contextLabel ?? `Rule ${ruleIndex + 1} output "${outputName}"`;
  const text = raw.trim();
  if (text === '') {
    throw new Error(`${label} must not be empty`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text, (_key, value: unknown) => {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new Error('Non-finite output numbers are not supported');
      }
      return value;
    });
  } catch {
    if (outputType === 'string' || outputType === 'date') return text;
    throw new Error(`${label} is not a valid JSON literal: ${raw} (hint: quote strings, e.g. "gold")`);
  }
  if (parsed === null || outputType === undefined) return parsed;
  if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  switch (outputType) {
    case 'string':
      if (typeof parsed === 'string') return parsed;
      throw new Error(
        `${label} must be a string (declared output type "string"); quote the value, e.g. "gold". Got: ${JSON.stringify(parsed)}`,
      );
    case 'date':
      if (typeof parsed === 'string') return parsed;
      throw new Error(
        `${label} must be a string (dates use ISO strings like "2026-01-01"). Got: ${JSON.stringify(parsed)}`,
      );
    case 'number':
      if (typeof parsed === 'number') return parsed;
      throw new Error(`${label} must be a number (declared output type "number"). Got: ${JSON.stringify(parsed)}`);
    case 'boolean':
      if (typeof parsed === 'boolean') return parsed;
      throw new Error(`${label} must be a boolean (declared output type "boolean"). Got: ${JSON.stringify(parsed)}`);
    case 'list':
      if (Array.isArray(parsed)) return parsed;
      throw new Error(`${label} must be an array (declared output type "list"). Got: ${JSON.stringify(parsed)}`);
  }
}

/**
 * Key-order-insensitive serialization for output comparison.
 * Plain JSON.stringify is order-sensitive, so two rules producing the same
 * logical output with different entry orders would falsely disagree.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
}

function ruleMatches(rule: DecisionRule, values: Record<string, unknown>): boolean {
  // Entries reference validated inputs; a missing entry is a wildcard.
  for (const entry of rule.inputEntries) {
    const value = Object.prototype.hasOwnProperty.call(values, entry.inputName) ? values[entry.inputName] : undefined;
    if (!matchesCell(value, entry.expression)) {
      return false;
    }
  }
  return true;
}

function buildOutput(rule: DecisionRule, ruleIndex: number, table: DecisionTable): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const types = new Map(table.outputs.map((declared) => [declared.name, declared.type]));
  for (const entry of rule.outputEntries) {
    output[entry.outputName] = parseOutputLiteral(
      entry.value,
      entry.outputName,
      ruleIndex,
      types.get(entry.outputName),
    );
  }
  return output;
}

function mergeCollectOutputs(hits: Array<{ index: number; output: Record<string, unknown> }>): Record<string, unknown> {
  const merged: Record<string, unknown[]> = {};
  for (const hit of hits) {
    for (const [key, value] of Object.entries(hit.output)) {
      if (!Object.prototype.hasOwnProperty.call(merged, key)) merged[key] = [];
      merged[key].push(value);
    }
  }
  return merged;
}

/**
 * Priority rank of one hit: per-output index into outputPriorities
 * (lower wins). Unknown values sort last; without any priorities every
 * hit ranks equally and rule order decides.
 */
function hitRank(table: DecisionTable, hit: { output: Record<string, unknown> }): number[] {
  return table.outputs.map((output) => {
    const priorities =
      table.outputPriorities && Object.prototype.hasOwnProperty.call(table.outputPriorities, output.name)
        ? table.outputPriorities[output.name]
        : undefined;
    if (!priorities) return Number.POSITIVE_INFINITY;
    const needle = stableStringify(hit.output[output.name]);
    const found = priorities.findIndex((candidate) => stableStringify(candidate) === needle);
    return found === -1 ? Number.POSITIVE_INFINITY : found;
  });
}

function compareRanks(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? Number.POSITIVE_INFINITY;
    const b = right[index] ?? Number.POSITIVE_INFINITY;
    // Infinity - Infinity is NaN, not a tie; compare before subtracting.
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

function applyAggregation(
  table: DecisionTable,
  hits: Array<{ index: number; output: Record<string, unknown> }>,
  aggregation: CollectAggregation,
): Record<string, unknown> {
  if (aggregation === 'NONE') return mergeCollectOutputs(hits);
  const result: Record<string, unknown> = {};
  for (const output of table.outputs) {
    const values = hits.map((hit) => hit.output[output.name]).filter((value) => value !== undefined);
    if (aggregation === 'COUNT') {
      result[output.name] = values.length;
      continue;
    }
    if (values.length === 0) {
      result[output.name] = null;
      continue;
    }
    if (aggregation === 'SUM') {
      if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
        throw new Error(
          `COLLECT SUM requires numeric outputs, but output "${output.name}" collected non-numeric values`,
        );
      }
      result[output.name] = (values as number[]).reduce((total, value) => total + value, 0);
      if (!Number.isFinite(result[output.name])) throw new Error(`COLLECT SUM overflow for output "${output.name}"`);
      continue;
    }
    // String ordering is lexicographic, not timezone-aware date ordering.
    const allNumbers = values.every((value) => typeof value === 'number' && Number.isFinite(value));
    const allStrings = values.every((value) => typeof value === 'string');
    if (!allNumbers && !allStrings) {
      throw new Error(`COLLECT ${aggregation} requires all-numeric or all-string values for output "${output.name}"`);
    }
    result[output.name] = (values as Array<number | string>).reduce((best, value) =>
      (aggregation === 'MIN' ? value < best : value > best) ? value : best,
    );
  }
  return result;
}

/**
 * Evaluates one input record against a decision table.
 * Pure function: no I/O, deterministic.
 */
export function evaluate(table: DecisionTable, values: Record<string, unknown>): EvaluationResult {
  validateTable(table);
  const inputValues: Record<string, unknown> = {};
  for (const input of table.inputs) {
    const path = input.expression === undefined ? [input.name] : inputReferencePath(input.expression);
    let value: unknown = values;
    for (const key of path) {
      value =
        value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)
          ? (value as Record<string, unknown>)[key]
          : undefined;
    }
    inputValues[input.name] = value;
  }
  const hits: Array<{ index: number; output: Record<string, unknown> }> = [];
  for (const [index, rule] of table.rules.entries()) {
    if (ruleMatches(rule, inputValues)) {
      hits.push({ index, output: buildOutput(rule, index, table) });
      if (table.hitPolicy === 'FIRST') break;
    }
  }
  if (hits.length === 0) {
    return { matchedRuleIndexes: [], output: { ...(table.defaultOutput ?? {}) } };
  }

  switch (table.hitPolicy) {
    case 'FIRST': {
      const [first] = hits;
      return { matchedRuleIndexes: [first.index], output: first.output };
    }
    case 'UNIQUE': {
      if (hits.length > 1) {
        throw new Error(`UNIQUE hit policy violated: rules ${hits.map((hit) => hit.index + 1).join(', ')} all matched`);
      }
      return { matchedRuleIndexes: [hits[0].index], output: hits[0].output };
    }
    case 'ANY': {
      const [first, ...rest] = hits;
      const firstJson = stableStringify(first.output);
      const disagreeing = rest.filter((hit) => stableStringify(hit.output) !== firstJson);
      if (disagreeing.length > 0) {
        throw new Error(
          `ANY hit policy violated: rules ${hits.map((hit) => hit.index + 1).join(', ')} matched with different outputs`,
        );
      }
      return { matchedRuleIndexes: hits.map((hit) => hit.index), output: first.output };
    }
    case 'COLLECT': {
      return {
        matchedRuleIndexes: hits.map((hit) => hit.index),
        output: applyAggregation(table, hits, table.aggregation ?? 'NONE'),
      };
    }
    case 'RULE ORDER': {
      return {
        matchedRuleIndexes: hits.map((hit) => hit.index),
        output: mergeCollectOutputs(hits),
      };
    }
    case 'OUTPUT ORDER': {
      // Highest-priority outputs first; ties keep rule order (stable sort).
      // Without outputPriorities this degrades to rule order.
      const ranked = hits.map((hit, position) => ({ hit, position, rank: hitRank(table, hit) }));
      ranked.sort((left, right) => compareRanks(left.rank, right.rank) || left.position - right.position);
      const ordered = ranked.map(({ hit }) => hit);
      return {
        matchedRuleIndexes: ordered.map((hit) => hit.index),
        output: mergeCollectOutputs(ordered),
      };
    }
    case 'PRIORITY': {
      // Highest-priority hit wins; ties keep rule order.
      // Without outputPriorities this degrades to first-hit-wins.
      let best = { hit: hits[0], rank: hitRank(table, hits[0]) };
      for (const hit of hits.slice(1)) {
        const rank = hitRank(table, hit);
        if (compareRanks(rank, best.rank) < 0) {
          best = { hit, rank };
        }
      }
      return { matchedRuleIndexes: [best.hit.index], output: best.hit.output };
    }
    default:
      throw new Error(`Unsupported hit policy "${String(table.hitPolicy)}"`);
  }
}
