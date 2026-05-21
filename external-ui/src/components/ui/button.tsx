import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bc-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-[var(--bc-blue)] text-white shadow-sm hover:bg-[var(--bc-blue-dark)]',
        secondary: 'bg-white text-[var(--bc-blue-dark)] shadow-sm hover:bg-white/90',
        outline: 'border border-[var(--bc-border)] bg-white text-[var(--bc-text)] hover:bg-[var(--bc-surface)]',
        ghost: 'text-[var(--bc-text)] hover:bg-[var(--bc-surface)] hover:text-[var(--bc-text)]',
        link: 'text-[var(--bc-link)] underline-offset-4 hover:underline',
        destructive: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type = 'button', ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return <Comp ref={ref} type={type} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  },
);

Button.displayName = 'Button';

export { Button };
