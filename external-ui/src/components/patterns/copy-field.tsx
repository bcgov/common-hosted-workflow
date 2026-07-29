import { useId, useState } from 'react';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CopyFieldProps {
  label: string;
  value: string;
  className?: string;
}

function CopyField({ label, value, className }: Readonly<CopyFieldProps>) {
  const valueId = useId();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('copied');
      globalThis.setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      setCopyStatus('error');
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <span id={`${valueId}-label`} className="block text-xs font-bold text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 items-stretch rounded-control border border-border bg-surface-subtle">
        <code
          id={valueId}
          aria-labelledby={`${valueId}-label`}
          className="min-w-0 flex-1 overflow-hidden px-3 py-2.5 font-mono text-xs text-ellipsis whitespace-nowrap text-foreground"
          title={value}
        >
          {value}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copyValue}
          className="rounded-l-none border-l border-border"
          aria-describedby={valueId}
        >
          {copyStatus === 'copied' ? (
            <IconCheck className="size-4" aria-hidden="true" />
          ) : (
            <IconCopy className="size-4" aria-hidden="true" />
          )}
          {copyStatus === 'copied' ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <span className="sr-only" aria-live="polite">
        {copyStatus === 'copied'
          ? `${label} copied to clipboard.`
          : copyStatus === 'error'
            ? `${label} could not be copied. Select the value and copy it manually.`
            : ''}
      </span>
    </div>
  );
}

export { CopyField };
