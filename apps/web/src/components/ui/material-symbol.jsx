import { cn } from '@/lib/utils';

export function MaterialSymbol({ name, className, ...props }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'material-symbols-rounded inline-flex size-4 shrink-0 items-center justify-center overflow-hidden text-base leading-none select-none',
        className,
      )}
      data-slot="material-symbol"
      {...props}
    >
      {name}
    </span>
  );
}
