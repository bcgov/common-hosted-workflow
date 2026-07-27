import { cloneElement, type HTMLAttributes, type ReactElement } from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

interface FieldControlProps {
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  htmlFor: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: ReactElement<FieldControlProps>;
}

function Field({ label, htmlFor, description, error, required, className, children, ...props }: Readonly<FieldProps>) {
  const messageId = error ? `${htmlFor}-error` : description ? `${htmlFor}-description` : undefined;
  const control = cloneElement(children, {
    'aria-describedby': [children.props['aria-describedby'], messageId].filter(Boolean).join(' ') || undefined,
    'aria-invalid': error ? true : children.props['aria-invalid'],
  });

  return (
    <div className={cn('space-y-1.5', className)} {...props}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-1 text-danger">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </Label>
      {control}
      {description && !error ? (
        <p id={`${htmlFor}-description`} className="text-xs leading-4 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-bold leading-4 text-danger-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { Field };
