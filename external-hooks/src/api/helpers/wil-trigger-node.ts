import { WIL_TRIGGER_NODE_TYPES } from '@config';
import {
  WIL_TRIGGER_INPUT_FIELD_TYPES,
  WIL_TRIGGER_INPUT_SOURCES,
  WIL_TRIGGER_RESPOND_MODES,
  WIL_TRIGGER_SOURCES,
  type WilTriggerInputFieldType,
  type WilTriggerInputSource,
  type WilTriggerRespondMode,
  type WilTriggerSource,
} from '../constants/enum';

/** One declared field of the WIL Trigger node's `input` schema. */
export type WilInputField = { name: string; type: WilTriggerInputFieldType };

/** Settings of a WIL Trigger node, parsed from the node JSON of a published workflow version. */
export type WilTriggerNodeInfo = {
  nodeId: string;
  nodeName: string;
  label: string;
  description: string;
  acceptedSources: WilTriggerSource[];
  inputSource: WilTriggerInputSource;
  /** Empty for `passthrough`. */
  inputSchema: WilInputField[];
  respondMode: WilTriggerRespondMode;
  responseTimeoutSec: number;
};

// Defaults must mirror the node description: n8n omits parameters equal to their default from saved JSON.
export const WIL_NODE_DEFAULT_TIMEOUT_SEC = 30;
export const WIL_NODE_MAX_TIMEOUT_SEC = 120;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pickEnum<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function parseSources(value: unknown): WilTriggerSource[] {
  if (!Array.isArray(value)) return [...WIL_TRIGGER_SOURCES];
  return WIL_TRIGGER_SOURCES.filter((source) => value.includes(source));
}

function jsonTypeOf(value: unknown): WilTriggerInputFieldType {
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return value === null ? 'string' : 'object';
    default:
      return 'string';
  }
}

function parseInputSchema(inputSource: WilTriggerInputSource, params: Record<string, unknown>): WilInputField[] {
  if (inputSource === 'workflowInputs') {
    const values = asRecord(params.workflowInputs).values;
    if (!Array.isArray(values)) return [];
    return values.flatMap((entry): WilInputField[] => {
      const field = asRecord(entry);
      const name = typeof field.name === 'string' ? field.name.trim() : '';
      return name ? [{ name, type: pickEnum(WIL_TRIGGER_INPUT_FIELD_TYPES, field.type, 'string') }] : [];
    });
  }

  if (inputSource === 'jsonExample' && typeof params.jsonExample === 'string') {
    try {
      const example = asRecord(JSON.parse(params.jsonExample));
      return Object.entries(example).map(([name, value]) => ({ name, type: jsonTypeOf(value) }));
    } catch {
      return [];
    }
  }

  return [];
}

/** Parses one n8n node; returns null unless it is an enabled WIL Trigger node with an id. */
export function parseWilTriggerNode(node: unknown): WilTriggerNodeInfo | null {
  const raw = asRecord(node);
  if (typeof raw.type !== 'string' || !WIL_TRIGGER_NODE_TYPES.includes(raw.type) || raw.disabled === true) return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;

  const params = asRecord(raw.parameters);
  const nodeName = typeof raw.name === 'string' ? raw.name : '';
  const inputSource = pickEnum(WIL_TRIGGER_INPUT_SOURCES, params.inputSource, 'passthrough');
  const timeout = Number(params.responseTimeoutSec ?? WIL_NODE_DEFAULT_TIMEOUT_SEC);

  return {
    nodeId: raw.id,
    nodeName,
    label:
      typeof params.displayLabel === 'string' && params.displayLabel.trim() ? params.displayLabel.trim() : nodeName,
    description: typeof params.description === 'string' ? params.description : '',
    acceptedSources: parseSources(params.acceptedSources),
    inputSource,
    inputSchema: parseInputSchema(inputSource, params),
    respondMode: pickEnum(WIL_TRIGGER_RESPOND_MODES, params.respondMode, 'immediately'),
    responseTimeoutSec: Number.isFinite(timeout)
      ? Math.min(Math.max(Math.trunc(timeout), 1), WIL_NODE_MAX_TIMEOUT_SEC)
      : WIL_NODE_DEFAULT_TIMEOUT_SEC,
  };
}

/** All enabled WIL Trigger nodes in a node list. */
export function extractWilTriggerNodes(nodes: unknown): WilTriggerNodeInfo[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node) => {
    const info = parseWilTriggerNode(node);
    return info ? [info] : [];
  });
}

/** One WIL Trigger node by its (rename-stable) n8n node id. */
export function findWilTriggerNode(nodes: unknown, nodeId: string): WilTriggerNodeInfo | null {
  return extractWilTriggerNodes(nodes).find((info) => info.nodeId === nodeId) ?? null;
}

function matchesType(type: WilTriggerInputFieldType, value: unknown): boolean {
  switch (type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return typeof value === 'string';
  }
}

/**
 * Validates caller-supplied input values against a node's declared schema.
 * Missing/empty values are allowed (the node fills defaults); wrong types are reported.
 */
export function validateWilInput(schema: WilInputField[], values: unknown): string[] {
  if (schema.length === 0 || values === undefined || values === null) return [];
  const provided = asRecord(values);
  return schema.flatMap((field) => {
    const value = provided[field.name];
    if (value === undefined || value === null || value === '') return [];
    return matchesType(field.type, value) ? [] : [`"${field.name}" must be of type ${field.type}`];
  });
}
