/**
 * Shared primitives used across trigger form components.
 */
import { IconInfoCircle } from '@tabler/icons-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TriggerActorType, TriggerMethod } from '../../../services/backend/triggers';

export type FormMode = 'idle' | 'create' | 'edit';

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
      className="flex h-10 w-full rounded-md border border-[var(--bc-border)] bg-white px-3 py-2 text-sm text-[var(--bc-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bc-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
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
    <div className="flex items-start gap-2 rounded-md border border-[var(--bc-border)] bg-[var(--bc-surface)] px-3 py-2.5">
      <IconInfoCircle size={15} className="mt-0.5 shrink-0 text-[var(--bc-blue)]" aria-hidden="true" />
      <p className="text-xs text-[var(--bc-muted)]">Actor ID will be included in the request — {detail}.</p>
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

export function TriggerUrlField({
  id,
  label,
  value,
  onChange,
  placeholder = 'e.g. http://n8n:5678/webhook/...',
}: Readonly<{ id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} <span className="text-red-500">*</span>
      </Label>
      <Input id={id} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
