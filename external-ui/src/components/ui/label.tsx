import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';

import { cn } from '@/lib/utils';

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-sm font-bold leading-5 text-foreground peer-disabled:cursor-not-allowed peer-disabled:text-muted-foreground',
      className,
    )}
    {...props}
  />
));

Label.displayName = 'Label';

export { Label };
