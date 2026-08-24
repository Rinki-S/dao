/**
 * A task carries its metadata as plain text: `@due(2026-08-25)` for a date and
 * `!high` for a priority. Nothing here rewrites that text — it only reports
 * where the annotations are, so the editor can decorate them and the file on
 * disk stays readable Markdown.
 */

// Lookbehind rather than a captured leading space, so the reported range is the
// annotation itself and two adjacent annotations cannot swallow each other's
// separator.
const ANNOTATION_PATTERN =
  /(?<=^|\s)(?:@due\((\d{4})-(\d{2})-(\d{2})\)|!(high|medium|low))(?=\s|$)/g;

export const PRIORITY_LEVELS = ['high', 'medium', 'low'];

/** Today in the viewer's own timezone: a due date is a calendar day, not an instant. */
export function localToday(now = new Date()) {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// `2026-02-30` parses as March 2nd. Round-tripping through Date catches the
// overflow, and an unreal date is left as plain text so the typo stays visible.
function isRealDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

// ISO dates sort as strings, so no parsing is needed to compare two days.
function dueStatus(date, today) {
  if (date < today) return 'overdue';
  if (date === today) return 'today';
  return 'upcoming';
}

/**
 * Find every annotation in a line of task text.
 *
 * @param {string} text
 * @param {{ today?: string }} [options] `today` as `YYYY-MM-DD`; defaults to the local day.
 * @returns {Array<{ from: number, to: number, kind: 'due' | 'priority', date?: string, status?: string, level?: string }>}
 */
export function parseTaskAnnotations(text, { today = localToday() } = {}) {
  if (typeof text !== 'string' || text.length === 0) return [];

  const annotations = [];
  ANNOTATION_PATTERN.lastIndex = 0;

  let match = ANNOTATION_PATTERN.exec(text);
  while (match !== null) {
    const [matched, year, month, day, level] = match;
    const from = match.index;
    const to = from + matched.length;

    if (level) {
      annotations.push({ from, to, kind: 'priority', level });
    } else {
      const date = `${year}-${month}-${day}`;
      if (isRealDate(Number(year), Number(month), Number(day))) {
        annotations.push({ from, to, kind: 'due', date, status: dueStatus(date, today) });
      }
    }

    match = ANNOTATION_PATTERN.exec(text);
  }

  return annotations;
}
