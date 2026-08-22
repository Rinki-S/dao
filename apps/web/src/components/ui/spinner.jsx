import { IconLoader2 as Loader2Icon } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

export function Spinner({ className, ...props }) {
  return (
    <Loader2Icon
      aria-label="Loading"
      className={cn('animate-spin', className)}
      role="status"
      {...props}
    />
  );
}
