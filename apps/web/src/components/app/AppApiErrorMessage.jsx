export function AppApiErrorMessage({ children, className }) {
  if (!children) {
    return null;
  }

  return (
    <p role="alert" className={`text-sm text-danger ${className ?? ''}`}>
      {children}
    </p>
  );
}
