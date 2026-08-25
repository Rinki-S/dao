import { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it } from 'vitest';

import { getDurableMarkdown } from '@/features/notes/editor/markdown-serialization.js';
import { createMarkdownEditorExtensions } from '@/features/notes/editor/tiptap-extensions.js';

import { TaskBatch } from './task-batch-extension.js';

let editor;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

function openOn(markdown) {
  editor = new Editor({
    content: markdown,
    contentType: 'markdown',
    extensions: [...createMarkdownEditorExtensions(), TaskBatch],
  });
  return editor;
}

function markdown() {
  return getDurableMarkdown(editor).trimEnd();
}

function positionOf(word) {
  let found = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null || !node.isText || !node.text.includes(word)) return true;
    found = pos + node.text.indexOf(word) + 1;
    return false;
  });

  return found;
}

function caretOn(word) {
  editor.commands.setTextSelection(positionOf(word));
}

function selectAcross(from, to) {
  editor.commands.setTextSelection({ from: positionOf(from), to: positionOf(to) });
}

describe('setTasksChecked', () => {
  it('ticks every task the selection reaches', () => {
    openOn('- [ ] First\n- [ ] Second\n- [ ] Third\n');
    selectAcross('First', 'Second');

    expect(editor.commands.setTasksChecked(true)).toBe(true);
    expect(markdown()).toBe('- [x] First\n- [x] Second\n- [ ] Third');
  });

  it('unticks a whole selection just as well', () => {
    openOn('- [x] First\n- [x] Second\n');
    selectAcross('First', 'Second');

    editor.commands.setTasksChecked(false);

    expect(markdown()).toBe('- [ ] First\n- [ ] Second');
  });

  it('reaches subtasks inside the selection', () => {
    openOn(`- [ ] Ship v2
  - [ ] Write the changelog
  - [ ] Tag the release
`);
    selectAcross('Ship', 'Tag');

    editor.commands.setTasksChecked(true);

    expect(markdown()).toBe(`- [x] Ship v2
  - [x] Write the changelog
  - [x] Tag the release`);
  });

  it('leaves a parent alone when only its subtask is selected', () => {
    openOn('- [ ] Ship v2\n  - [ ] Write the changelog\n');
    caretOn('changelog');

    editor.commands.setTasksChecked(true);

    expect(markdown()).toBe('- [ ] Ship v2\n  - [x] Write the changelog');
  });

  it('mixes ticked and unticked tasks to the state that was asked for', () => {
    openOn('- [x] First\n- [ ] Second\n');
    selectAcross('First', 'Second');

    editor.commands.setTasksChecked(true);

    expect(markdown()).toBe('- [x] First\n- [x] Second');
  });

  it('treats a selection already in that state as done, not failed', () => {
    openOn('- [x] First\n');
    caretOn('First');

    expect(editor.commands.setTasksChecked(true)).toBe(true);
    expect(markdown()).toBe('- [x] First');
  });

  it('fails when the selection holds no task at all', () => {
    openOn('Just a paragraph\n');
    caretOn('paragraph');

    expect(editor.commands.setTasksChecked(true)).toBe(false);
  });

  it('puts a whole batch back with one undo', () => {
    openOn('- [ ] First\n- [ ] Second\n');
    selectAcross('First', 'Second');
    editor.commands.setTasksChecked(true);

    editor.commands.undo();

    expect(markdown()).toBe('- [ ] First\n- [ ] Second');
  });
});

describe('clearCompletedTasks', () => {
  it('removes the finished tasks and leaves the rest', () => {
    openOn('- [x] First\n- [ ] Second\n- [x] Third\n');

    expect(editor.commands.clearCompletedTasks()).toBe(true);
    expect(markdown()).toBe('- [ ] Second');
  });

  it('takes a finished task and its subtasks together', () => {
    openOn(`- [ ] Ship v3
- [x] Ship v2
  - [ ] Tag the release
`);

    editor.commands.clearCompletedTasks();

    expect(markdown()).toBe('- [ ] Ship v3');
  });

  it('keeps a finished subtask under a parent that is still open', () => {
    // It is the record of work done on a task still in progress, not a task on
    // the pile of finished ones.
    const source = '- [ ] Ship v2\n  - [x] Write the changelog';
    openOn(`${source}\n`);

    expect(editor.commands.clearCompletedTasks()).toBe(false);
    expect(markdown()).toBe(source);
  });

  it('removes a list that is entirely finished rather than emptying it', () => {
    // A task list has to hold at least one task; an empty one is not a document.
    openOn('# Tasks\n\n- [x] First\n- [x] Second\n');

    editor.commands.clearCompletedTasks();

    expect(markdown()).toBe('# Tasks');
  });

  it('fails when nothing is finished, so a menu can say so', () => {
    openOn('- [ ] First\n- [ ] Second\n');

    expect(editor.commands.clearCompletedTasks()).toBe(false);
  });

  it('brings them all back with one undo', () => {
    const source = '- [x] First\n- [ ] Second\n- [x] Third';
    openOn(`${source}\n`);
    editor.commands.clearCompletedTasks();

    editor.commands.undo();

    expect(markdown()).toBe(source);
  });
});
