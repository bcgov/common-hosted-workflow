import { useState } from 'react';
import { IconCheck, IconChevronDown, IconKey, IconPencil, IconPlus } from '@tabler/icons-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { ChefsCredentialSummary } from '../../../services/backend/chefs-credentials';

export interface ChefsCredentialComboboxProps {
  id?: string;
  credentials: ChefsCredentialSummary[];
  value: string;
  onSelect: (credentialId: string) => void;
  onAddNew: () => void;
  onEdit: (credential: ChefsCredentialSummary) => void;
  isLoading: boolean;
  /** True when `value` names a credential that is no longer in `credentials`. */
  savedCredentialMissing?: boolean;
  /** Label to show for a missing saved credential (usually the trigger's last-known form name). */
  missingLabel?: string;
}

export function credentialOptionLabel(credential: ChefsCredentialSummary): string {
  return credential.formName ? `${credential.name} — ${credential.formName}` : credential.name;
}

export function ChefsCredentialCombobox({
  id,
  credentials,
  value,
  onSelect,
  onAddNew,
  onEdit,
  isLoading,
  savedCredentialMissing = false,
  missingLabel = 'Saved credential',
}: Readonly<ChefsCredentialComboboxProps>) {
  const [open, setOpen] = useState(false);
  const selected = credentials.find((credential) => credential.id === value);

  const triggerLabel = isLoading
    ? 'Loading credentials...'
    : selected
      ? credentialOptionLabel(selected)
      : savedCredentialMissing
        ? `${missingLabel} (unavailable)`
        : 'Select a CHEFS credential...';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={isLoading}>
        <button
          id={id}
          type="button"
          className={cn(
            'flex h-11 w-full items-center gap-2.5 rounded-lg border-[1.5px] border-border-strong bg-surface px-3.5 py-2.5 text-left text-sm text-foreground shadow-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-muted-foreground',
            !selected && !savedCredentialMissing && 'text-muted-foreground',
          )}
        >
          <IconKey size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 truncate">{triggerLabel}</span>
          <IconChevronDown size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1">
        <div className="max-h-72 overflow-y-auto">
          {savedCredentialMissing && (
            <div className="px-3 py-2 text-sm text-muted-foreground italic">{missingLabel} (unavailable)</div>
          )}
          {!isLoading && credentials.length === 0 && !savedCredentialMissing && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No CHEFS Form Authentication credentials are shared with this project.
            </p>
          )}
          {credentials.map((credential) => {
            const isSelected = credential.id === value;
            return (
              <div
                key={credential.id}
                className={cn(
                  'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-surface-subtle',
                  isSelected && 'bg-surface-subtle',
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(credential.id);
                    setOpen(false);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <IconKey size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-foreground">{credential.name}</span>
                    {credential.formName && (
                      <span className="ml-1.5 text-muted-foreground">— {credential.formName}</span>
                    )}
                  </span>
                  {isSelected && <IconCheck size={16} className="shrink-0 text-primary" aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onEdit(credential);
                    setOpen(false);
                  }}
                  aria-label={`Edit ${credential.name}`}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-surface hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <IconPencil size={15} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="border-t border-border-strong p-1">
          <button
            type="button"
            onClick={() => {
              onAddNew();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium text-primary hover:bg-surface-subtle"
          >
            <IconPlus size={16} aria-hidden="true" />
            Add CHEFS credential
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
