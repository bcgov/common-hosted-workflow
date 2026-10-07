import type { IDataObject, INodeExecutionData } from 'n8n-workflow';

export type WilFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';
export type WilInputField = { name: string; type: WilFieldType };

const EXAMPLE_VALUES: Record<WilFieldType, unknown> = {
  string: 'example',
  number: 0,
  boolean: false,
  object: {},
  array: [],
};

function isPlainObject(value: unknown): value is IDataObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads the declared input fields from the node's parameters (`workflowInputs.values` or a JSON example). */
export function readInputSchema(
  inputSource: string,
  workflowInputs: { values?: Array<{ name?: string; type?: string }> } | undefined,
  jsonExample: string | undefined,
): WilInputField[] {
  if (inputSource === 'workflowInputs') {
    return (workflowInputs?.values ?? []).flatMap((entry) => {
      const name = entry.name?.trim();
      return name ? [{ name, type: (entry.type as WilFieldType) ?? 'string' }] : [];
    });
  }

  if (inputSource === 'jsonExample' && jsonExample) {
    try {
      const parsed: unknown = JSON.parse(jsonExample);
      if (!isPlainObject(parsed)) return [];
      return Object.entries(parsed).map(([name, value]) => ({
        name,
        type: Array.isArray(value)
          ? 'array'
          : typeof value === 'number' || typeof value === 'boolean'
            ? (typeof value as WilFieldType)
            : typeof value === 'object' && value !== null
              ? 'object'
              : 'string',
      }));
    } catch {
      return [];
    }
  }

  return [];
}

/** Gives every declared field a stable key (null when absent) so downstream expressions never hit undefined. */
export function shapeInput(schema: WilInputField[], input: unknown): IDataObject {
  const provided = isPlainObject(input) ? input : {};
  if (schema.length === 0) return provided;
  const shaped: IDataObject = {};
  for (const field of schema) shaped[field.name] = (provided[field.name] as IDataObject | undefined) ?? null;
  // Keep undeclared extras last so declared fields lead.
  for (const [key, value] of Object.entries(provided)) if (!(key in shaped)) shaped[key] = value as IDataObject;
  return shaped;
}

/** Sample item for editor test runs, where no real WIL call supplies data. */
export function buildSampleItem(schema: WilInputField[], label: string): INodeExecutionData {
  const input: IDataObject = {};
  for (const field of schema) input[field.name] = EXAMPLE_VALUES[field.type] as IDataObject;
  return {
    json: {
      source: 'wil',
      trigger: { id: 'sample-trigger-id', type: 'button', name: label },
      actor: { email: 'user@example.com', tenantId: 'sample-tenant', roles: [], groups: [] },
      input,
      firedAt: new Date().toISOString(),
    },
  };
}
