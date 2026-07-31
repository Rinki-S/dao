import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';

import { cn } from '@/lib/utils';
import { IconCheck, IconMinus } from '@tabler/icons-react';

function Checkbox({ className, ref, ...props }) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      data-slot="checkbox"
      className={cn(
        'group/checkbox peer relative flex size-4 shrink-0 items-center justify-center text-transparent transition-shadow outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring aria-invalid:ring-2 aria-invalid:ring-destructive/20 data-checked:text-primary-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50 data-indeterminate:text-primary-foreground dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        data-slot="checkbox-surface"
        className="pointer-events-none absolute inset-0 rounded-xs border border-input transition-colors group-aria-invalid/checkbox:border-destructive group-aria-invalid/checkbox:group-aria-checked/checkbox:border-primary group-data-checked/checkbox:border-primary group-data-checked/checkbox:bg-primary group-data-indeterminate/checkbox:border-primary group-data-indeterminate/checkbox:bg-primary dark:bg-input/30 dark:group-aria-invalid/checkbox:border-destructive/50 dark:group-data-checked/checkbox:bg-primary dark:group-data-indeterminate/checkbox:bg-primary"
      />
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="relative z-10 grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <IconCheck className="group-data-indeterminate/checkbox:hidden" />
        <IconMinus className="hidden group-data-indeterminate/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
