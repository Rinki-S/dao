/**
 * A reply cut into the pieces it was written in.
 *
 * A turn arrives as one run of prose and a list of tool calls, each carrying
 * how much of that prose had been written when it ran. This puts the two back
 * together in the order they happened: the model says something, goes and
 * looks, and carries on — which is what it actually did, and is the thing a
 * transcript that gathers every call above the answer cannot show.
 *
 * Offsets are UTF-16 code units, which is what a JavaScript string index is,
 * so `content.slice` can be trusted with them directly.
 *
 * Returns a flat list of `{ kind: 'text', text }` and `{ kind: 'call', call }`.
 */
export function interleave(content = '', calls = []) {
  const parts = [];
  let cursor = 0;

  // Sorted rather than assumed. They are recorded in order, but a stored row
  // is a list somebody could reorder, and a cut that walked backwards would
  // silently drop the text between the two.
  const ordered = [...calls].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));

  for (const call of ordered) {
    // Clamped at both ends. Below the cursor is an offset that would go
    // backwards; above the length is one from a turn whose text was cut short
    // — a reply that was stopped keeps the words that arrived, and a call
    // recorded after them points past where the transcript now ends.
    const at = Math.min(Math.max(call.at ?? 0, cursor), content.length);

    const text = content.slice(cursor, at);
    if (text) parts.push({ kind: 'text', text });

    parts.push({ kind: 'call', call });
    cursor = at;
  }

  const rest = content.slice(cursor);
  if (rest) parts.push({ kind: 'text', text: rest });

  return parts;
}
