export const activityChangedEventName = 'dao:activity-changed';

export function notifyActivityChanged() {
  window.dispatchEvent(new CustomEvent(activityChangedEventName));
}

export function subscribeToActivityChanged(listener) {
  window.addEventListener(activityChangedEventName, listener);

  return () => {
    window.removeEventListener(activityChangedEventName, listener);
  };
}
