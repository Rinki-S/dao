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

// Tiptap emits `create` a macrotask after construction, so the grouping a file
// gets on load has not run yet when the constructor returns.
async function render(markdown) {
  element = document.createElement('div');
  document.body.append(element);
  editor = new Editor({
    element,
    content: markdown,
    contentType: 'markdown',
    extensions: [...createMarkdownEditorExtensions(), TaskGrouping],
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  return element;
}

function markdown() {
  return getDurableMarkdown(editor).trimEnd();
}

function dividers(root) {
  return [...root.querySelectorAll('.dao-task-group-divider')];
}

function checkboxFor(root, label) {
  const item = [...root.querySelectorAll('li[data-checked]')].find(
    (candidate) => candidate.querySelector('p')?.textContent === label,
  );
  return item.querySelector('input[type="checkbox"]');
}

describe('TaskGrouping', () => {
  it('moves a task to the end of the file when it is ticked', async () => {
    const root = await render('- [ ] Ship v1\n- [ ] Ship v2\n- [ ] Ship v3\n');

    checkboxFor(root, 'Ship v1').click();

    expect(markdown()).toBe('- [ ] Ship v2\n- [ ] Ship v3\n- [x] Ship v1');
  });

  it('brings a task back above the finished ones when it is unticked', async () => {
    const root = await render('- [ ] Ship v2\n- [x] Ship v1\n- [x] Ship v0\n');

    checkboxFor(root, 'Ship v1').click();

    // It rejoins the open tasks at the end of them. Where it was before it was
    // finished is not written down anywhere, so it cannot go back there.
    expect(markdown()).toBe('- [ ] Ship v2\n- [ ] Ship v1\n- [x] Ship v0');
  });

  it('groups a file that arrives ungrouped', async () => {
    // Written by hand, or by another editor, or before this existed.
    await render('- [x] Ship v0\n- [ ] Ship v2\n- [x] Ship v1\n- [ ] Ship v3\n');

    expect(markdown()).toBe('- [ ] Ship v2\n- [ ] Ship v3\n- [x] Ship v0\n- [x] Ship v1');
  });

  it('keeps the order within each group', async () => {
    await render('- [ ] C\n- [x] B\n- [ ] A\n- [x] D\n');

    // Not sorted — only partitioned. C still comes before A, B before D.
    expect(markdown()).toBe('- [ ] C\n- [ ] A\n- [x] B\n- [x] D');
  });

  it('leaves a finished subtask under the parent that is still open', async () => {
    const source = `- [ ] Ship v2
  - [x] Write the changelog
  - [ ] Tag the release
`;
    await render(source);

    expect(markdown()).toBe(source.trimEnd());
  });

  it('moves a finished parent and its subtasks together', async () => {
    const root = await render(`- [ ] Ship v2
  - [ ] Tag the release
- [ ] Ship v3
`);

    checkboxFor(root, 'Ship v2').click();

    expect(markdown()).toBe('- [ ] Ship v3\n- [x] Ship v2\n  - [ ] Tag the release');
  });

  it('draws a divider where the finished tasks begin', async () => {
    const root = await render('- [ ] Ship v2\n- [x] Ship v1\n');

    expect(dividers(root)).toHaveLength(1);
  });

  it.each([
    ['nothing is done', '- [ ] Ship v2\n- [ ] Ship v3\n'],
    ['everything is done', '- [x] Ship v1\n- [x] Ship v2\n'],
  ])('draws no divider when %s', async (_case, source) => {
    expect(dividers(await render(source))).toHaveLength(0);
  });

  it('carries the caret along with the task it moved', async () => {
    const root = await render('- [ ] Ship v1\n- [ ] Ship v2\n- [ ] Ship v3\n');

    // Caret in the first task, which is about to become the last.
    editor.commands.setTextSelection(3);
    expect(editor.state.selection.$from.parent.textContent).toBe('Ship v1');

    checkboxFor(root, 'Ship v1').click();

    expect(editor.state.selection.$from.parent.textContent).toBe('Ship v1');
  });

  it('puts the task back where it was on undo', async () => {
    const root = await render('- [ ] Ship v1\n- [ ] Ship v2\n');

    checkboxFor(root, 'Ship v1').click();
    expect(markdown()).toBe('- [ ] Ship v2\n- [x] Ship v1');

    editor.commands.undo();

    expect(markdown()).toBe('- [ ] Ship v1\n- [ ] Ship v2');
  });
});
