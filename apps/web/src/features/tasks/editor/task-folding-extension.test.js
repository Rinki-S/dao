import { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it } from 'vitest';

import { getDurableMarkdown } from '@/features/notes/editor/markdown-serialization.js';
import { createMarkdownEditorExtensions } from '@/features/notes/editor/tiptap-extensions.js';

import { TaskFolding } from './task-folding-extension.js';

const NESTED = `- [ ] Ship v2
  - [x] Write the changelog
  - [ ] Tag the release
- [ ] Ship v3
`;

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
    extensions: [...createMarkdownEditorExtensions(), TaskFolding],
  });

  return element;
}

function folds(root) {
  return [...root.querySelectorAll('.dao-task-fold')];
}

function click(button) {
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

describe('TaskFolding', () => {
  it('offers a fold only on tasks that have subtasks', () => {
    const root = render(NESTED);

    // "Ship v2" has children; "Ship v3" and the two subtasks do not.
    expect(folds(root)).toHaveLength(1);
  });

  it('offers no fold at all in a flat list', () => {
    expect(folds(render('- [ ] Ship v2\n- [ ] Ship v3\n'))).toHaveLength(0);
  });

  it('collapses and expands the task it belongs to', () => {
    const root = render(NESTED);
    const [fold] = folds(root);

    expect(fold.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('.dao-task-item--collapsed')).toBeNull();

    click(fold);

    expect(folds(root)[0].getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('.dao-task-item--collapsed')).not.toBeNull();

    click(folds(root)[0]);

    expect(folds(root)[0].getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('.dao-task-item--collapsed')).toBeNull();
  });

  it('leaves the Markdown untouched, folded or not', () => {
    // A fold is how the list is being read, not what it says. It must never
    // reach the file.
    const root = render(NESTED);

    click(folds(root)[0]);

    // Trailing whitespace aside — any dispatch adds an empty last paragraph in
    // this environment, folded or not — not a character of the list moves.
    expect(getDurableMarkdown(editor).trimEnd()).toBe(NESTED.trimEnd());
  });

  it('does not leave the caret hidden inside a task it just folded', () => {
    const root = render(NESTED);
    let changelogPos = null;

    editor.state.doc.descendants((node, pos) => {
      if (changelogPos !== null || !node.isText || !node.text.includes('changelog')) return true;
      changelogPos = pos + 1;
      return false;
    });
    editor.commands.setTextSelection(changelogPos);

    click(folds(root)[0]);

    // Moved out of the subtask that is now hidden, up onto the folded line.
    expect(editor.state.selection.from).toBeLessThan(changelogPos);
    expect(editor.state.selection.$from.parent.textContent).toBe('Ship v2');
  });

  it('keeps a fold on the right task after an edit above it', () => {
    const root = render(NESTED);
    click(folds(root)[0]);

    editor.chain().focus('start').insertContent('Now ').run();

    expect(folds(root)[0].getAttribute('aria-expanded')).toBe('false');
    expect(getDurableMarkdown(editor)).toContain('- [ ] Now Ship v2');
  });
});
