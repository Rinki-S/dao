import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import './task-grouping.css';

const taskGroupingPluginKey = new PluginKey('taskGrouping');

function isDone(child) {
  return child.type.name === 'taskItem' && child.attrs.checked === true;
}

function childrenOf(node) {
  const children = [];
  node.forEach((child) => children.push(child));
  return children;
}

// Stable within each group: finishing one task must not shuffle the others.
function groupedOrder(children) {
  return [...children.filter((child) => !isDone(child)), ...children.filter(isDone)];
}

function isAlreadyGrouped(children, ordered) {
  return children.every((child, index) => child === ordered[index]);
}

// Where the caret should land once the items around it have moved. Node
// identity carries it: the same node object appears at a new index.
function followSelection(selection, contentFrom, children, ordered) {
  let pos = contentFrom;
  let held = null;

  for (const child of children) {
    if (selection.from >= pos && selection.from <= pos + child.nodeSize) {
      held = { child, offset: selection.from - pos };
      break;
    }
    pos += child.nodeSize;
  }

  if (!held) return null;

  let next = contentFrom;
  for (const child of ordered) {
    if (child === held.child) return next + held.offset;
    next += child.nodeSize;
  }

  return null;
}

function groupingTransaction(state) {
  let transaction = null;

  // Only lists at the top of the document. A subtask belongs to its parent, so
  // finishing one must never lift it out from under a task that is still open.
  state.doc.forEach((node, offset) => {
    if (node.type.name !== 'taskList') return;

    const children = childrenOf(node);
    const ordered = groupedOrder(children);
    if (isAlreadyGrouped(children, ordered)) return;

    const contentFrom = offset + 1;
    const caret = followSelection(state.selection, contentFrom, children, ordered);

    transaction = transaction ?? state.tr;
    // A permutation, so every node keeps its size and nothing outside this list
    // moves — several lists can be rewritten in the one transaction.
    transaction.replaceWith(contentFrom, offset + node.nodeSize - 1, ordered);

    if (caret !== null) {
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(caret)));
    }
  });

  return transaction;
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

  doc.forEach((node, offset) => {
    if (node.type.name !== 'taskList') return;

    let pos = offset + 1;
    let open = 0;
    let boundary = null;

    node.forEach((child) => {
      // With nothing above it, a divider divides nothing.
      if (isDone(child) && boundary === null && open > 0) boundary = pos;
      if (!isDone(child)) open += 1;
      pos += child.nodeSize;
    });

    if (boundary !== null) {
      decorations.push(
        Decoration.widget(boundary, divider, { side: -1, key: `done-divider-${boundary}` }),
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

/**
 * Keep finished tasks below the ones still to do.
 *
 * This reorders the document, so the file itself is grouped and `tasks.md`
 * reads the same way anywhere else. Ticking a box therefore moves a line, and
 * the move is part of that edit — one undo puts both back.
 *
 * Only top-level lists are touched. A finished subtask stays under its parent,
 * because it belongs to that parent rather than to a pile of finished work.
 */
export const TaskGrouping = Extension.create({
  name: 'taskGrouping',

  // A file written elsewhere, or by an earlier version, arrives ungrouped.
  onCreate() {
    const transaction = groupingTransaction(this.editor.state);
    if (transaction) this.editor.view.dispatch(transaction);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: taskGroupingPluginKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          return groupingTransaction(newState);
        },
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
          decorations(state) {
            return taskGroupingPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});
