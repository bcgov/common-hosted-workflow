import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-transparent text-[0.8125rem] font-bold leading-none transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover active:bg-primary-active',
        secondary:
          'border-primary bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary-hover active:bg-surface-muted',
        outline: 'border-border-strong bg-surface text-foreground hover:bg-surface-subtle active:bg-surface-muted',
        ghost: 'bg-transparent text-foreground hover:bg-surface-subtle active:bg-surface-muted',
        link: 'h-auto border-0 bg-transparent px-0 py-0 text-link underline-offset-4 shadow-none hover:text-link-hover hover:underline',
        destructive: 'bg-danger text-white shadow-sm hover:bg-danger-hover active:bg-danger-hover',
      },
      size: {
        default: 'min-h-10 px-4 py-2.5',
        sm: 'min-h-9 px-3 py-2 text-xs',
        lg: 'min-h-11 px-6 py-3 text-sm',
        icon: 'size-10 p-0',
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
