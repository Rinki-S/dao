import { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it } from 'vitest';

import { getDurableMarkdown } from '@/features/notes/editor/markdown-serialization.js';
import { createMarkdownEditorExtensions } from '@/features/notes/editor/tiptap-extensions.js';

import { TaskAnnotations } from './task-annotation-extension.js';
import { shiftDate } from './task-annotations.js';

let editor;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

// The caret sits on the first task, which is where a toolbar click would apply.
function openOn(markdown) {
  editor = new Editor({
    content: markdown,
    contentType: 'markdown',
    extensions: [...createMarkdownEditorExtensions(), TaskAnnotations],
  });
  editor.commands.focus('start');
  return editor;
}

function firstLine() {
  return getDurableMarkdown(editor).split('\n')[0];
}

// Put the caret inside a word, the way clicking on that line would.
function caretOn(word) {
  let target = null;

  editor.state.doc.descendants((node, pos) => {
    if (target !== null || !node.isText || !node.text.includes(word)) return true;
    target = pos + node.text.indexOf(word) + 1;
    return false;
  });

  editor.commands.setTextSelection(target);
}

describe('task annotation commands', () => {
  it('appends a due date to a task that has none', () => {
    openOn('- [ ] Ship v2\n');

    expect(editor.commands.setTaskDue('2026-08-25')).toBe(true);
    expect(firstLine()).toBe('- [ ] Ship v2 @due(2026-08-25)');
  });

  it('replaces a due date in place rather than adding a second', () => {
    openOn('- [ ] Ship v2 @due(2026-08-25) !high\n');

    editor.commands.setTaskDue('2026-09-01');

    expect(firstLine()).toBe('- [ ] Ship v2 @due(2026-09-01) !high');
  });

  it('replaces a due date that was mistyped', () => {
    // Otherwise the broken one stays and the line ends up carrying two.
    openOn('- [ ] Ship v2 @due(2026-02-30)\n');

    editor.commands.setTaskDue('2026-09-01');

    expect(firstLine()).toBe('- [ ] Ship v2 @due(2026-09-01)');
  });

  it('takes the separating space with a cleared annotation', () => {
    openOn('- [ ] Ship v2 @due(2026-08-25)\n');

    expect(editor.commands.setTaskDue(null)).toBe(true);
    expect(firstLine()).toBe('- [ ] Ship v2');
  });

  it('clears an annotation from the middle of a line without leaving a gap', () => {
    openOn('- [ ] Ship @due(2026-08-25) v2\n');

    editor.commands.setTaskDue(null);

    expect(firstLine()).toBe('- [ ] Ship v2');
  });

  it('treats clearing an annotation that is not there as done, not failed', () => {
    openOn('- [ ] Ship v2\n');

    expect(editor.commands.setTaskDue(null)).toBe(true);
    expect(firstLine()).toBe('- [ ] Ship v2');
  });

  it.each(['high', 'medium', 'low'])('sets and replaces the %s priority', (level) => {
    openOn('- [ ] Ship v2 !low\n');

    editor.commands.setTaskPriority(level);

    expect(firstLine()).toBe(`- [ ] Ship v2 !${level}`);
  });

  it('keeps a due date and a priority side by side', () => {
    openOn('- [ ] Ship v2\n');

    editor.commands.setTaskDue('2026-08-25');
    editor.commands.setTaskPriority('high');

    expect(firstLine()).toBe('- [ ] Ship v2 @due(2026-08-25) !high');
  });

  it('applies to the task the caret is on, not the first one', () => {
    openOn(`- [ ] First
- [ ] Second
`);
    caretOn('Second');

    editor.commands.setTaskPriority('high');

    expect(getDurableMarkdown(editor).trimEnd()).toBe('- [ ] First\n- [ ] Second !high');
  });

  it('annotates a subtask without disturbing its parent or its indentation', () => {
    openOn(`- [ ] Ship v2
  - [x] Write the changelog
  - [ ] Tag the release
`);
    caretOn('changelog');

    editor.commands.setTaskDue('2026-08-25');

    expect(getDurableMarkdown(editor).trimEnd()).toBe(
      `- [ ] Ship v2
  - [x] Write the changelog @due(2026-08-25)
  - [ ] Tag the release`,
    );
  });
});

describe('shiftDate', () => {
  it.each([
    ['2026-08-24', 1, '2026-08-25'],
    ['2026-08-24', 7, '2026-08-31'],
    ['2026-08-31', 1, '2026-09-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
  ])('shifts %s by %i days to %s', (date, days, expected) => {
    expect(shiftDate(date, days)).toBe(expected);
  });
});
