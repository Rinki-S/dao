import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

import { cn } from '@/lib/utils';

function Popover({ ...props }) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = 'center',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  anchor,
  ref,
  ...props
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          ref={ref}
          data-slot="popover-content"
          className={cn(
            'rounded-lg z-50 flex w-72 origin-(--transform-origin) flex-col gap-4 bg-popover p-2.5 text-xs text-popover-foreground shadow-(--shadow-popover) ring-1 ring-foreground/10 outline-hidden duration-(--motion-fast) data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

function PopoverHeader({ className, ...props }) {
  return (
    <div
      data-slot="popover-header"
      className={cn('flex flex-col gap-1 text-xs', className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn('text-sm font-medium', className)}
      {...props}
    />
  );
}

function PopoverDescription({ className, ...props }) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn('text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger };
