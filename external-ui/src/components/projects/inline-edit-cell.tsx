import { useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toasts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type InlineEditCellProps = {
  value: string | null;
  onSave: (newValue: string | null) => void;
  isLoading: boolean;
  error: string | null;
};

export function InlineEditCell({ value, onSave, isLoading, error }: Readonly<InlineEditCellProps>) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousErrorRef = useRef<string | null>(null);

  // Handle error prop: show toast and exit edit mode
  useEffect(() => {
    if (error && error !== previousErrorRef.current) {
      previousErrorRef.current = error;
      toast.error(error);
      setIsEditing(false);
    } else if (!error) {
      previousErrorRef.current = null;
    }
  }, [error]);

  // Auto-focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  function enterEditMode() {
    if (isLoading) return;
    setValidationError(null);
    setInputValue(value ?? '');
    setIsEditing(true);
  }

  function cancelEdit() {
    setInputValue(value ?? '');
    setValidationError(null);
    setIsEditing(false);
  }

  function submitValue() {
    const trimmed = inputValue.trim();

    // Empty means delete the mapping
    if (trimmed === '') {
      if (value !== null) {
        onSave(null);
      }
      setIsEditing(false);
      return;
    }

    // Validate UUID format
    if (!UUID_REGEX.test(trimmed)) {
      setValidationError('Invalid UUID format');
      return;
    }

    // No change — just close
    if (trimmed === value) {
      setIsEditing(false);
      return;
    }

    setValidationError(null);
    onSave(trimmed);
    setIsEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitValue();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-[var(--bc-muted)]">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span>Saving…</span>
      </span>
    );
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (validationError) setValidationError(null);
          }}
          onBlur={submitValue}
          onKeyDown={handleKeyDown}
          aria-label="Tenant ID"
          aria-invalid={!!validationError}
          aria-describedby={validationError ? 'inline-edit-error' : undefined}
          className="h-8 text-sm"
          placeholder="Enter UUID"
        />
        {validationError && (
          <span id="inline-edit-error" className="text-xs text-red-600" role="alert">
            {validationError}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={enterEditMode}
      className="w-full cursor-pointer rounded px-1 py-0.5 text-left text-sm hover:bg-[var(--bc-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bc-blue)]"
      aria-label={value ? `Edit tenant ID: ${value}` : 'Assign tenant ID'}
    >
      {value ? <span className="font-mono text-xs">{value}</span> : <span className="text-[var(--bc-muted)]">—</span>}
    </button>
  );
}
