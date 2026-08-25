import { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it } from 'vitest';

import { getDurableMarkdown } from '@/features/notes/editor/markdown-serialization.js';
import { createMarkdownEditorExtensions } from '@/features/notes/editor/tiptap-extensions.js';

import { TaskAnnotations } from './task-annotation-extension.js';

const TODAY = '2026-08-24';

let editor;
let element;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
  element?.remove();
  element = undefined;
});

function render(markdown) {
  element = document.createElement('div');
  document.body.append(element);
  editor = new Editor({
    element,
    content: markdown,
    contentType: 'markdown',
    extensions: [
      ...createMarkdownEditorExtensions(),
      TaskAnnotations.configure({ getToday: () => TODAY }),
    ],
  });

  return element;
}

function chips(root) {
  return [...root.querySelectorAll('.dao-task-annotation')];
}

describe('TaskAnnotations decorations', () => {
  it('renders a due date and a priority as separate chips', () => {
    const root = render('- [ ] Fix parser recovery @due(2026-08-25) !high\n');
    const [due, priority] = chips(root);

    expect(due.textContent).toBe('@due(2026-08-25)');
    expect(due.className).toContain('dao-task-annotation--due');
    expect(priority.textContent).toBe('!high');
    expect(priority.className).toContain('dao-task-annotation--priority-high');
  });

  it.each([
    ['2026-08-23', 'overdue'],
    ['2026-08-24', 'today'],
    ['2026-08-25', 'upcoming'],
  ])('marks a %s due date as %s', (date, status) => {
    const root = render(`- [ ] Ship @due(${date})\n`);

    expect(chips(root)[0].className).toContain(`dao-task-annotation--due-${status}`);
  });

  it('stops a finished task from shouting about a date that has passed', () => {
    const done = chips(render('- [x] Ship @due(2026-08-01)\n'))[0];
    const open = chips(render('- [ ] Ship @due(2026-08-01)\n'))[0];

    expect(done.className).toContain('dao-task-annotation--done');
    expect(open.className).not.toContain('dao-task-annotation--done');
  });

  it('reads the checked state of the nearest task, not an ancestor', () => {
    const root = render(`- [x] Ship @due(2026-08-01)
  - [ ] Write the changelog @due(2026-08-01)
`);
    const [parent, child] = chips(root);

    expect(parent.className).toContain('dao-task-annotation--done');
    expect(child.className).not.toContain('dao-task-annotation--done');
  });

  it('decorates annotations outside a task list too', () => {
    const root = render('Review the plan @due(2026-08-25)\n');

    expect(chips(root)).toHaveLength(1);
  });

  it('leaves the Markdown on disk exactly as it was', () => {
    // The whole point of decorating rather than modelling: nothing here can
    // rewrite the file.
    const source = `- [ ] Fix parser recovery @due(2026-08-25) !high
  - [x] Add error fixtures @due(2026-08-01) !low
`;
    render(source);

    expect(getDurableMarkdown(editor).trimEnd()).toBe(source.trimEnd());
  });

  it('re-reads annotations after an edit', () => {
    const root = render('- [ ] Ship\n');
    expect(chips(root)).toHaveLength(0);

    editor.chain().focus('end').insertContent(' @due(2026-08-25)').run();

    expect(chips(root)[0].textContent).toBe('@due(2026-08-25)');
  });
});
