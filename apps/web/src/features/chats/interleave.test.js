import { describe, expect, it } from 'vitest';

import { interleave } from './interleave.js';

const kinds = (parts) => parts.map((part) => part.kind);
const texts = (parts) => parts.filter((p) => p.kind === 'text').map((p) => p.text);

describe('interleave', () => {
  it('puts a call where the model made it', () => {
    const parts = interleave('Let me look. You wrote about parsers.', [
      { name: 'search_notes', at: 13 },
    ]);

    expect(kinds(parts)).toEqual(['text', 'call', 'text']);
    expect(texts(parts)).toEqual(['Let me look. ', 'You wrote about parsers.']);
  });

  it('keeps several calls in the order they happened', () => {
    const parts = interleave('one two three', [
      { name: 'b', at: 8 },
      { name: 'a', at: 4 },
    ]);

    // Sorted rather than trusted: a cut that walked backwards would drop the
    // text between the two.
    expect(kinds(parts)).toEqual(['text', 'call', 'text', 'call', 'text']);
    expect(parts[1].call.name).toBe('a');
    expect(parts[3].call.name).toBe('b');
  });

  it('draws consecutive calls together with no empty text between them', () => {
    const parts = interleave('Looking.', [
      { name: 'a', at: 8 },
      { name: 'b', at: 8 },
    ]);

    expect(kinds(parts)).toEqual(['text', 'call', 'call']);
  });

  it('leaves a call with no offset at the front', () => {
    // Every call stored before offsets existed reads as zero, which puts it
    // exactly where it used to be drawn. An old conversation should look the
    // way it always did rather than wrongly.
    const parts = interleave('An answer.', [{ name: 'search_notes' }]);

    expect(kinds(parts)).toEqual(['call', 'text']);
  });

  it('clamps an offset past the end of a reply that was cut short', () => {
    // A stopped turn keeps the words that arrived; a call recorded after them
    // points past where the transcript now ends.
    const parts = interleave('Half an ans', [{ name: 'search_notes', at: 900 }]);

    expect(kinds(parts)).toEqual(['text', 'call']);
    expect(texts(parts)).toEqual(['Half an ans']);
  });

  it('cuts on UTF-16 offsets, the way the service counts them', () => {
    // "🙂 hi" — the emoji is two code units, so the cut after it is at 2. A
    // rune count would put it at 1 and split the surrogate pair.
    const parts = interleave('🙂 hi', [{ name: 'search_notes', at: 2 }]);

    expect(texts(parts)).toEqual(['🙂', ' hi']);
  });

  it('is just the text when nothing was called', () => {
    expect(interleave('An answer.', [])).toEqual([{ kind: 'text', text: 'An answer.' }]);
  });

  it('is nothing at all when there is nothing', () => {
    expect(interleave('', [])).toEqual([]);
  });
});
