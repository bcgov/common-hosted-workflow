import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { WilInputField } from '../../../services/backend/trigger-types';
import { NO_AUTOFILL } from './no-autofill';
import { Select } from './trigger-shared';
import { formatInputValue, isParseError, parseInputValue, pruneInputValues } from './workflow-input-utils';

interface WorkflowInputFieldsProps {
  idPrefix: string;
  schema: WilInputField[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

/** One editor per field declared on the selected WIL Trigger node. */
export function WorkflowInputFields({ idPrefix, schema, values, onChange }: Readonly<WorkflowInputFieldsProps>) {
  // Keep raw text per field so half-typed JSON/numbers aren't clobbered by re-formatting.
  const [raw, setRaw] = useState<Record<string, string>>(() =>
    Object.fromEntries(schema.map((field) => [field.name, formatInputValue(field.type, values[field.name])])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (schema.length === 0) return null;

  function update(field: WilInputField, text: string) {
    setRaw((prev) => ({ ...prev, [field.name]: text }));
    const parsed = parseInputValue(field.type, text);
    if (isParseError(parsed)) {
      setErrors((prev) => ({ ...prev, [field.name]: parsed.error }));
      return;
    }
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([name]) => name !== field.name)));
    onChange(pruneInputValues(schema, { ...values, [field.name]: parsed }));
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-border-strong bg-surface-subtle px-3.5 py-3">
      <legend className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Workflow inputs
      </legend>
      {schema.map((field) => {
        const id = `${idPrefix}-input-${field.name}`;
        const text = raw[field.name] ?? '';
        return (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={id}>
              {field.name} <span className="text-xs font-normal text-muted-foreground">({field.type})</span>
            </Label>
            {field.type === 'boolean' ? (
              <Select id={id} value={text} onChange={(v) => update(field, v)}>
                <option value="">Not set</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </Select>
            ) : field.type === 'object' || field.type === 'array' ? (
              <Textarea
                id={id}
                rows={3}
                value={text}
                onChange={(e) => update(field, e.target.value)}
                className="font-mono text-xs"
                {...NO_AUTOFILL}
              />
            ) : (
              <Input
                id={id}
                type={field.type === 'number' ? 'number' : 'text'}
                value={text}
                onChange={(e) => update(field, e.target.value)}
                {...NO_AUTOFILL}
              />
            )}
            {errors[field.name] && <p className="text-sm text-red-600">{errors[field.name]}</p>}
          </div>
        );
      })}
    </fieldset>
  );
}
