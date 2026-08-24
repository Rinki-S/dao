import { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it } from 'vitest';

import { getDurableMarkdown } from '@/features/notes/editor/markdown-serialization.js';
import { createMarkdownEditorExtensions } from '@/features/notes/editor/tiptap-extensions.js';

import { TaskGrouping } from './task-grouping-extension.js';

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
    extensions: [...createMarkdownEditorExtensions(), TaskGrouping],
  });

  return element;
}

function dividers(root) {
  return [...root.querySelectorAll('.dao-task-group-divider')];
}

describe('TaskGrouping', () => {
  it('divides a list that has work on both sides of the line', () => {
    const root = render('- [x] Ship v1\n- [ ] Ship v2\n');

    expect(dividers(root)).toHaveLength(1);
  });

  it.each([
    ['nothing is done', '- [ ] Ship v2\n- [ ] Ship v3\n'],
    ['everything is done', '- [x] Ship v1\n- [x] Ship v2\n'],
  ])('draws no divider when %s', (_case, markdown) => {
    expect(dividers(render(markdown))).toHaveLength(0);
  });

  it('leaves a finished subtask under the parent that is still open', () => {
    // The parent list is all-open, so nothing is divided; the nested list is
    // not a top-level list and is never grouped at all.
    const root = render(`- [ ] Ship v2
  - [x] Write the changelog
  - [ ] Tag the release
`);

    expect(dividers(root)).toHaveLength(0);
  });

  it('groups the top-level list without touching the nested one', () => {
    const root = render(`- [ ] Ship v2
  - [x] Write the changelog
- [x] Ship v1
`);

    // One divider, in the outer list — not one per list.
    expect(dividers(root)).toHaveLength(1);
    expect(dividers(root)[0].parentElement).toBe(root.querySelector('ul[data-type="taskList"]'));
  });

  it('appears once a task is ticked and goes again when it is unticked', () => {
    const root = render('- [ ] Ship v2\n- [ ] Ship v3\n');
    expect(dividers(root)).toHaveLength(0);

    const [firstCheckbox] = root.querySelectorAll('input[type="checkbox"]');
    firstCheckbox.click();
    expect(dividers(root)).toHaveLength(1);

    root.querySelectorAll('input[type="checkbox"]')[0].click();
    expect(dividers(root)).toHaveLength(0);
  });

  it('leaves the order of the file alone', () => {
    // The grouping is layout. A task that moves on screen has not moved in the
    // document, and nothing here may reorder anyone's lines.
    const source = '- [x] Ship v1\n- [ ] Ship v2\n- [x] Ship v0\n';
    render(source);

    expect(getDurableMarkdown(editor).trimEnd()).toBe(source.trimEnd());
  });
});
