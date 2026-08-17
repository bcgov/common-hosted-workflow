/**
 * Shared primitives used across trigger form components.
 */
import { IconDeviceFloppy, IconInfoCircle, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { TriggerActorType, TriggerMethod } from '../../../services/backend/trigger-types';

export type FormMode = 'idle' | 'view' | 'create' | 'edit';

// ---------------------------------------------------------------------------
// Select — BC-themed native <select> wrapper
// ---------------------------------------------------------------------------
export interface SelectProps {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}

export function Select({ id, value, onChange, children, disabled }: Readonly<SelectProps>) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="flex h-11 w-full rounded-lg border-[1.5px] border-[#c6c5c3] bg-white px-3.5 py-2.5 text-sm text-[#2d2d2d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#013366] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#f3f2f1] disabled:text-[#9f9d9c] appearance-none"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235a6475' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.75rem center',
      }}
    >
      {children}
    </select>
  );
}

// ---------------------------------------------------------------------------
// ActorIdBanner — static info strip at the bottom of every trigger form
// ---------------------------------------------------------------------------
export function ActorIdBanner({ method }: Readonly<{ method: TriggerMethod }>) {
  const detail = method === 'POST' ? 'added as actorId field in the JSON body' : 'added as actorId query parameter';
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-[#91c4fa] bg-[#f1f8fe] px-3.5 py-3">
      <IconInfoCircle size={18} className="mt-0.5 shrink-0 text-[#255a90]" aria-hidden="true" />
      <p className="text-[13px] text-[#474543]">Actor ID will be included in the request — {detail}.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared field components — used in both CHEFS Form and Button trigger forms
// ---------------------------------------------------------------------------

export function AllowedActorsTypeField({
  id,
  value,
  onChange,
  disabled = false,
}: Readonly<{ id: string; value: TriggerActorType; onChange: (v: TriggerActorType) => void; disabled?: boolean }>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        Allowed Actors Type <span className="text-red-500">*</span>
      </Label>
      <Select id={id} value={value} onChange={(v) => onChange(v as TriggerActorType)} disabled={disabled}>
        <option value="" disabled>
          Select an actor type
        </option>
        <option value="all">All</option>
        <option value="role">Role</option>
        <option value="user">User</option>
        <option value="group">Group</option>
        <option value="other">Other</option>
      </Select>
    </div>
  );
}

export function AllowedActorsField({
  id,
  value,
  onChange,
  placeholder = '*',
  required = false,
  disabled = false,
}: Readonly<{
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Allowed Actors {required && <span className="text-red-500">*</span>}</Label>
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

export function PostBodyField({
  id,
  value,
  onChange,
  method,
}: Readonly<{ id: string; value: string; onChange: (v: string) => void; method: TriggerMethod }>) {
  if (method !== 'POST') return null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>POST Body (optional JSON)</Label>
      <Textarea
        id={id}
        placeholder={'e.g. {"time": "today"}'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="font-mono text-xs"
      />
    </div>
  );
}

export function TriggerMethodField({
  id,
  value,
  onChange,
}: Readonly<{ id: string; value: TriggerMethod; onChange: (v: TriggerMethod) => void }>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Trigger Method</Label>
      <Select id={id} value={value} onChange={(v) => onChange(v as TriggerMethod)}>
        <option value="POST">POST</option>
        <option value="GET">GET</option>
      </Select>
    </div>
  );
}

function isValidUrl(val: string): boolean {
  try {
    const url = new URL(val);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function TriggerUrlField({
  id,
  label,
  value,
  onChange,
  placeholder = 'e.g. http://n8n:5678/webhook/...',
}: Readonly<{ id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }>) {
  const [touched, setTouched] = useState(false);
  const invalid = touched && value.trim() !== '' && !isValidUrl(value);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} <span className="text-red-500">*</span>
      </Label>
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={invalid}
        className={invalid ? 'border-red-500 focus-visible:ring-red-500' : undefined}
      />
      {invalid && <p className="text-xs text-red-500">Please enter a valid HTTP or HTTPS URL.</p>}
    </div>
  );
}

export function TriggerFormActions({
  onSave,
  onCancel,
  isSaving,
  isValid,
}: Readonly<{ onSave: () => void; onCancel: () => void; isSaving: boolean; isValid: boolean }>) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <Button
        type="button"
        variant="outline"
        className="border-[#013366] text-[#013366] hover:bg-[#013366]/5"
        onClick={onCancel}
      >
        <IconX size={16} aria-hidden="true" />
        Cancel
      </Button>
      <Button
        type="button"
        className="bg-[#013366] text-white hover:bg-[#013366]/90"
        onClick={onSave}
        disabled={!isValid || isSaving}
      >
        <IconDeviceFloppy size={16} aria-hidden="true" />
        {isSaving ? 'Saving...' : 'Save Trigger'}
      </Button>
    </div>
  );
}
