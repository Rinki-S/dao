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

// How many rows the comparison is allowed to draw.
//
// Context folding is no help when every line is a change, which is exactly what
// a deletion is: the note is the removal, so there is no untouched stretch to
// fold and a long note would draw a row per line. That is a card taller than the
// conversation it interrupts, and it arrives on the one kind of change nobody
// can undo.
//
// Two hundred is enough to read a long note's shape and decide, and the rest is
// counted rather than dropped, for the same reason a folded stretch is: somebody
// agreeing to lose a file has to be able to see that it goes on past the bottom
// of the card.
const maxLines = 200;

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
 *
 * Whatever survives that is then capped, because folding cannot help a change
 * that touches every line. What is cut is counted too, and from the end: a note
 * is read from the top, so the top is the part worth keeping.
 */
export function fold(lines, context = contextLines, limit = maxLines) {
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

  if (folded.length <= limit) return folded;

  // Counted in lines of the note rather than in rows, since a row standing for
  // a folded stretch is worth as many lines as it folded away. "412 more lines"
  // has to mean 412 lines of the file.
  const cut = folded
    .slice(limit)
    .reduce((total, line) => total + (line.op === 'folded' ? line.count : 1), 0);

  return [...folded.slice(0, limit), { op: 'more', count: cut }];
}
