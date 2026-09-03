import { describe, expect, it } from 'vitest';

import { fold } from './diff.js';

function keep(...texts) {
  return texts.map((text) => ({ op: 'keep', text }));
}

describe('fold', () => {
  it('keeps a few unchanged lines on each side of a change', () => {
    const folded = fold(
      [
        ...keep('a', 'b', 'c'),
        { op: 'remove', text: 'old' },
        { op: 'add', text: 'new' },
        ...keep('d', 'e', 'f'),
      ],
      1,
    );

    // One line of context each side, and the rest counted rather than shown.
    expect(folded).toEqual([
      { op: 'folded', count: 2 },
      { op: 'keep', text: 'c' },
      { op: 'remove', text: 'old' },
      { op: 'add', text: 'new' },
      { op: 'keep', text: 'd' },
      { op: 'folded', count: 2 },
    ]);
  });

  it('says how much it folded away rather than dropping it quietly', () => {
    // A change shown without its surroundings looks smaller than it is. The
    // count is what tells the reader the note goes on past what they can see.
    const folded = fold([{ op: 'add', text: 'new' }, ...keep(...Array(20).fill('x'))], 3);

    expect(folded.at(-1)).toEqual({ op: 'folded', count: 17 });
  });

  it('shows a short comparison whole', () => {
    const lines = [...keep('a'), { op: 'add', text: 'b' }, ...keep('c')];

    expect(fold(lines, 3)).toEqual(lines);
  });

  it('folds a comparison with nothing changed in it', () => {
    // Not something the service should send — a change that changes nothing is
    // refused before anybody is asked about it — but the card is not the place
    // to find that out by throwing.
    expect(fold(keep('a', 'b'), 3)).toEqual([{ op: 'folded', count: 2 }]);
  });

  it('folds each stretch on its own', () => {
    // Two edits far apart are two places to look, not one long one.
    const folded = fold(
      [
        { op: 'add', text: 'first' },
        ...keep(...Array(10).fill('x')),
        { op: 'add', text: 'second' },
      ],
      1,
    );

    expect(folded).toEqual([
      { op: 'add', text: 'first' },
      { op: 'keep', text: 'x' },
      { op: 'folded', count: 8 },
      { op: 'keep', text: 'x' },
      { op: 'add', text: 'second' },
    ]);
  });
});
