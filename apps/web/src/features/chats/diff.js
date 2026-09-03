/**
 * What a proposed change would do, made readable.
 *
 * The comparison itself is not computed here. It arrives with the proposal,
 * worked out by the service from the same two texts that applying will write —
 * a second implementation on this side is exactly how the picture somebody
 * agreed to stops being the change that happens. What is left for this side is
 * how much of it to show, which is a question about a screen and could not have
 * been answered anywhere else.
 */

// How many untouched lines are kept on each side of a change.
//
// Three is the usual answer and it is the right one for prose: enough to see
// which paragraph is being changed, not so much that a one-line edit to a long
// note arrives as the whole note. What is folded away is still counted, so the
// reader can see there is more rather than being quietly shown a fragment.
const contextLines = 3;

/**
 * The comparison with long stretches of untouched text folded away.
 *
 * The service sends every line of both texts on purpose — it cannot know how
 * much context this surface wants, and a diff that had already dropped some
 * could not be asked for it back. Deciding is this side's business, and this is
 * where it is decided.
 *
 * A folded stretch becomes one entry saying how many lines it stands for. Not
 * removed silently: a change shown without its surroundings looks smaller than
 * it is, and the count is what says the note goes on.
 */
export function fold(lines, context = contextLines) {
  const near = new Set();

  lines.forEach((line, index) => {
    if (line.op === 'keep') return;

    for (let at = index - context; at <= index + context; at += 1) near.add(at);
  });

  const folded = [];

  lines.forEach((line, index) => {
    if (line.op !== 'keep' || near.has(index)) {
      folded.push(line);
      return;
    }

    const last = folded[folded.length - 1];
    if (last?.op === 'folded') {
      last.count += 1;
      return;
    }

    folded.push({ op: 'folded', count: 1 });
  });

  return folded;
}
