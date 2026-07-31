import { CornerSurface } from '@/lib/corners';
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }) {
  return (
    <CornerSurface
      dataSlot="skeleton"
      corner="md"
      className={cn('animate-pulse bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  );
}

export { Skeleton };
