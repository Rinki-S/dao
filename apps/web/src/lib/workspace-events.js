import { apiFetch } from '@/lib/api-client.js';
import { readEvents } from '@/lib/sse.js';

/** The service's word for "the folder no longer matches what you last read". */
export const WORKSPACE_CHANGED = 'workspace';

/**
 * How long to wait before trying again after the stream ends.
 *
 * It ends for ordinary reasons — the service restarting during development, a
 * laptop waking up — and an app that gave up the first time would silently stop
 * noticing the folder for the rest of the session. Backing off matters as much:
 * retrying instantly against a service that is not there is a busy loop that
 * shows up as a warm laptop and nothing else.
 */
const FIRST_RETRY = 500;
const LONGEST_RETRY = 15000;

/**
 * Listen for changes the service noticed in the workspace folder.
 *
 * Returns a function that stops listening. The callback is told only that
 * something changed, never what: the renderer already knows how to fetch what
 * it needs, and a payload here would be a second description of the same data,
 * which is the one that goes stale.
 */
export function watchWorkspace(onChange) {
  const controller = new AbortController();
  let retry = FIRST_RETRY;
  let stopped = false;

  async function connect() {
    while (!stopped) {
      try {
        const response = await apiFetch('/api/events', { signal: controller.signal });
        if (!response.ok) throw new Error(`events: ${response.status}`);

        // Connected, so the next failure starts its own backoff from the top
        // rather than inheriting the delay that got us here.
        retry = FIRST_RETRY;

        for await (const event of readEvents(response)) {
          if (event.name === WORKSPACE_CHANGED) onChange();
        }
      } catch (error) {
        if (stopped || error.name === 'AbortError') return;
      }

      if (stopped) return;

      await new Promise((resolve) => setTimeout(resolve, retry));
      retry = Math.min(retry * 2, LONGEST_RETRY);
    }
  }

  connect();

  return () => {
    stopped = true;
    controller.abort();
  };
}
