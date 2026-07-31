/* eslint-disable react-refresh/only-export-components */
import { cn } from '@/lib/utils';

/**
 * Dao corner tokens map 1:1 to the Tailwind `--radius-*` theme scale in
 * index.css. Components accept the same `corner` prop names the smooth-corner
 * adapter used, but rendering is plain CSS radius utilities, so borders,
 * rings, and focus outlines are never clipped.
 */
const CORNER_CLASSES = Object.freeze({
  none: 'rounded-none',
  xs: 'rounded-xs',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl',
  '4xl': 'rounded-4xl',
  pill: 'rounded-full',
  circle: 'rounded-full',
});

export function cornerClass(corner = 'md') {
  if (typeof corner !== 'string') {
    return CORNER_CLASSES.md;
  }

  return CORNER_CLASSES[corner] ?? CORNER_CLASSES.md;
}

export function CornerSurface({
  as: Component = 'div',
  corner = 'lg',
  dataSlot = 'corner-surface',
  ref,
  className,
  ...props
}) {
  return (
    <Component
      ref={ref}
      data-slot={dataSlot}
      className={cn(cornerClass(corner), className)}
      {...props}
    />
  );
}
