import { cn } from '@/lib/utils';

export function MaterialSymbol({ name, className, ...props }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'material-symbols-rounded inline-block size-4 shrink-0 overflow-hidden text-center text-[16px] leading-4 select-none',
        className,
      )}
      data-slot="material-symbol"
      {...props}
    >
      {name}
    </span>
  );
}
