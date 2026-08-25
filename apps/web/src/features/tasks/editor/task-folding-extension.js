import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import './task-folding.css';

const taskFoldingPluginKey = new PluginKey('taskFolding');

function hasSubtasks(taskItem) {
  let found = false;
  taskItem.forEach((child) => {
    if (child.type.name === 'taskList') found = true;
  });
  return found;
}

function subtasksStartAt(itemPos, taskItem) {
  // Content is a paragraph and then, when there are subtasks, a nested list.
  return itemPos + 1 + (taskItem.firstChild?.nodeSize ?? 0);
}

function foldButton(itemPos, isCollapsed) {
  return (view) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dao-task-fold';
    button.contentEditable = 'false';
    button.setAttribute('aria-expanded', String(!isCollapsed));
    button.setAttribute('aria-label', isCollapsed ? 'Show subtasks' : 'Hide subtasks');

    button.addEventListener('mousedown', (event) => {
      // Folding is a view action, not an edit: the caret should not move to the
      // button, and the editor should not lose focus.
      event.preventDefault();

      const { state } = view;
      const transaction = state.tr.setMeta(taskFoldingPluginKey, { toggle: itemPos });
      const taskItem = state.doc.nodeAt(itemPos);

      // Collapsing over the caret would hide it. Park it on the line being
      // folded, which is the one still on screen.
      if (!isCollapsed && taskItem) {
        const { from } = state.selection;
        const subtasksFrom = subtasksStartAt(itemPos, taskItem);

        if (from >= subtasksFrom && from < itemPos + taskItem.nodeSize) {
          transaction.setSelection(TextSelection.create(transaction.doc, subtasksFrom - 1));
        }
      }

      view.dispatch(transaction);
    });

    return button;
  };
}

function buildDecorations(doc, collapsed) {
  const decorations = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'taskItem' || !hasSubtasks(node)) return true;

    const isCollapsed = collapsed.has(pos);

    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: isCollapsed ? 'dao-task-item--collapsed' : 'dao-task-item--expanded',
      }),
    );
    // Inside the task's own paragraph, then pulled into the gutter by CSS —
    // the only inline position in a task item that is always there.
    decorations.push(
      Decoration.widget(pos + 2, foldButton(pos, isCollapsed), {
        side: -1,
        key: `fold-${pos}-${isCollapsed}`,
        ignoreSelection: true,
      }),
    );

    return true;
  });

  return DecorationSet.create(doc, decorations);
}

function remap(collapsed, mapping) {
  const mapped = new Set();

  for (const pos of collapsed) {
    const result = mapping.mapResult(pos);
    if (!result.deleted) mapped.add(result.pos);
  }

  return mapped;
}

/**
 * Fold a task's subtasks away.
 *
 * Which tasks are folded is view state, held here and remapped as the document
 * changes — deliberately not written to the file. A fold is how you are reading
 * the list right now; it is not something the person who opens `tasks.md` in
 * another editor should have to see. It lasts as long as the editor does.
 */
export const TaskFolding = Extension.create({
  name: 'taskFolding',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: taskFoldingPluginKey,
        state: {
          init(_config, state) {
            const collapsed = new Set();
            return { collapsed, decorations: buildDecorations(state.doc, collapsed) };
          },
          apply(transaction, previous, _oldState, newState) {
            const meta = transaction.getMeta(taskFoldingPluginKey);
            if (!transaction.docChanged && !meta) return previous;

            let collapsed = transaction.docChanged
              ? remap(previous.collapsed, transaction.mapping)
              : previous.collapsed;

            if (meta?.toggle !== undefined) {
              collapsed = new Set(collapsed);
              if (collapsed.has(meta.toggle)) collapsed.delete(meta.toggle);
              else collapsed.add(meta.toggle);
            }

            return { collapsed, decorations: buildDecorations(newState.doc, collapsed) };
          },
        },
        props: {
          // Scopes the gutter the fold arrow sits in to the task editor, so a
          // note's own task list keeps its layout.
          attributes: { class: 'dao-task-editor' },
          decorations(state) {
            return taskFoldingPluginKey.getState(state).decorations;
          },
        },
      }),
    ];
  },
});
