const STORAGE_KEY = 'dao.showThinking';

/**
 * Whether to show a reasoning model's working in the transcript.
 *
 * Off by default. The working is longer than the answer more often than not,
 * and somebody who has not asked for it is there to read the reply — a pane
 * that opened with the thinking unfolded would be answering a question nobody
 * asked, at the top, every time.
 *
 * A preference of this window's rather than a row in the database. It changes
 * nothing about what the service does: the working is streamed and stored
 * either way, because a turn needs it to be replayed to the model whatever
 * anybody has chosen to look at. So this decides what is drawn and nothing
 * else, which is what makes it safe to keep beside the appearance rather than
 * behind a request.
 */
export function readShowThinking() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeShowThinking(showThinking) {
  try {
    window.localStorage.setItem(STORAGE_KEY, showThinking ? 'true' : 'false');
  } catch {
    // The preference is cosmetic. Losing it is better than failing to apply it.
  }
}
