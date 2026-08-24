import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import './task-grouping.css';

const taskGroupingPluginKey = new PluginKey('taskGrouping');

function countByState(taskList) {
  let done = 0;
  let open = 0;

  taskList.forEach((item) => {
    if (item.type.name !== 'taskItem') return;
    if (item.attrs.checked) done += 1;
    else open += 1;
  });

  return { done, open };
}

function divider() {
  const element = document.createElement('div');
  element.className = 'dao-task-group-divider';
  element.contentEditable = 'false';
  // Decorative: the checkboxes already say which tasks are done.
  element.setAttribute('aria-hidden', 'true');
  element.textContent = 'Done';
  return element;
}

function buildDecorations(doc) {
  const decorations = [];

  // Only lists at the top of the document. A subtask belongs to its parent, so
  // finishing one must not lift it out from under a task that is still open.
  doc.forEach((node, offset) => {
    if (node.type.name !== 'taskList') return;

    const { done, open } = countByState(node);
    // With nothing on one side of it, a divider divides nothing.
    if (done === 0 || open === 0) return;

    decorations.push(
      Decoration.widget(offset + 1, divider, { side: -1, key: `done-divider-${offset}` }),
    );
  });

  return DecorationSet.create(doc, decorations);
}

/**
 * Gather finished tasks below the ones still to do.
 *
 * The regrouping is visual — CSS order over a flex list — and the document is
 * never touched. The file keeps the order it was written in, so `tasks.md`
 * still reads the way you typed it anywhere else, and ticking a box does not
 * rewrite lines out from under the caret or the undo history.
 */
export const TaskGrouping = Extension.create({
  name: 'taskGrouping',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: taskGroupingPluginKey,
        state: {
          init(_config, state) {
            return buildDecorations(state.doc);
          },
          apply(transaction, previous) {
            if (!transaction.docChanged) return previous;
            return buildDecorations(transaction.doc);
          },
        },
        props: {
          attributes: { class: 'dao-task-grouped' },
          decorations(state) {
            return taskGroupingPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});
