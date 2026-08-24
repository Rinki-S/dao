import { describe, expect, it } from 'vitest';

import { localToday, parseTaskAnnotations } from './task-annotations.js';

const TODAY = '2026-08-24';

function parse(text) {
  return parseTaskAnnotations(text, { today: TODAY });
}

describe('parseTaskAnnotations', () => {
  it('reports the range of a due date and the priority beside it', () => {
    const text = 'Fix parser recovery @due(2026-08-25) !high';
    const [due, priority] = parse(text);

    expect(text.slice(due.from, due.to)).toBe('@due(2026-08-25)');
    expect(due).toMatchObject({ kind: 'due', date: '2026-08-25', status: 'upcoming' });

    expect(text.slice(priority.from, priority.to)).toBe('!high');
    expect(priority).toMatchObject({ kind: 'priority', level: 'high' });
  });

  it.each([
    ['2026-08-23', 'overdue'],
    ['2026-08-24', 'today'],
    ['2026-08-25', 'upcoming'],
  ])('marks %s as %s', (date, status) => {
    expect(parse(`Ship @due(${date})`)[0].status).toBe(status);
  });

  it.each(['high', 'medium', 'low'])('reads the %s priority', (level) => {
    expect(parse(`Ship !${level}`)[0]).toMatchObject({ kind: 'priority', level });
  });

  it('leaves an impossible date as plain text so the typo stays visible', () => {
    expect(parse('Ship @due(2026-02-30)')).toEqual([]);
    expect(parse('Ship @due(2026-13-01)')).toEqual([]);
  });

  it('requires the annotation to stand on its own', () => {
    // Otherwise an address or an exclamation mid-word would light up.
    expect(parse('mail me@due(2026-08-25)')).toEqual([]);
    expect(parse('Ship @due(2026-08-25)now')).toEqual([]);
    expect(parse('urgent!high')).toEqual([]);
    expect(parse('Ship !highest')).toEqual([]);
  });

  it('finds annotations at both ends of the line', () => {
    const text = '!low Ship the thing @due(2026-08-25)';
    const [priority, due] = parse(text);

    expect(text.slice(priority.from, priority.to)).toBe('!low');
    expect(text.slice(due.from, due.to)).toBe('@due(2026-08-25)');
  });

  it('reads back-to-back annotations separately', () => {
    const annotations = parse('@due(2026-08-25) !high');

    expect(annotations).toHaveLength(2);
    expect(annotations.map((annotation) => annotation.kind)).toEqual(['due', 'priority']);
  });

  it('is reusable: a shared pattern must not carry an index between calls', () => {
    const text = 'Ship @due(2026-08-25)';

    expect(parse(text)).toEqual(parse(text));
  });

  it('ignores empty and non-string input', () => {
    expect(parseTaskAnnotations('')).toEqual([]);
    expect(parseTaskAnnotations(undefined)).toEqual([]);
  });

  it('reads today from the local calendar, not UTC', () => {
    // 23:30 local on the 24th is already the 25th in UTC; the due date the user
    // typed is a day on their calendar.
    expect(localToday(new Date(2026, 7, 24, 23, 30))).toBe('2026-08-24');
  });
});
