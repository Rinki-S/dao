import { cn } from '@/lib/utils.js';

export function AppApiErrorMessage({ children, className }) {
  if (!children) {
    return null;
  }

  return (
    <p role="alert" className={cn('text-sm text-danger', className)}>
      {children}
    </p>
  );
}
