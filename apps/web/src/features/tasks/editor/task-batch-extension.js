import { Extension } from '@tiptap/core';

import { selectedTaskItems } from './task-selection.js';

function isDoneTask(node) {
  return node.type.name === 'taskItem' && node.attrs.checked === true;
}

/**
 * What deleting the finished tasks would remove, back to front so each range
 * is still valid by the time the one before it has gone.
 *
 * Only top-level tasks, the same rule the grouping follows: a finished subtask
 * is the record of work done on a task that is still open, and belongs to that
 * parent rather than to a pile to be swept away.
 */
function completedRanges(doc) {
  const ranges = [];

  doc.forEach((node, offset) => {
    if (node.type.name !== 'taskList') return;

    const children = [];
    node.forEach((child) => children.push(child));
    if (children.length === 0) return;

    // A task list must hold at least one task, so a list that is entirely
    // finished goes as a whole rather than being emptied out.
    if (children.every(isDoneTask)) {
      ranges.push({ from: offset, to: offset + node.nodeSize });
      return;
    }

    let pos = offset + 1;
    for (const child of children) {
      if (isDoneTask(child)) ranges.push({ from: pos, to: pos + child.nodeSize });
      pos += child.nodeSize;
    }
  });

  return ranges.toReversed();
}

/**
 * Acting on many tasks at once.
 *
 * The selection is what "many" means: whatever it reaches is what changes.
 * Deleting finished tasks is the exception — it is about the list rather than
 * the selection, and says so in its name.
 */
export const TaskBatch = Extension.create({
  name: 'taskBatch',

  addCommands() {
    return {
      setTasksChecked:
        (checked) =>
        ({ state, dispatch }) => {
          const items = selectedTaskItems(state);
          if (items.length === 0) return false;

          const changing = items.filter(({ node }) => node.attrs.checked !== checked);
          // Already how it was asked to be: done, not failed.
          if (changing.length === 0) return true;

          if (dispatch) {
            const transaction = state.tr;
            // An attribute change keeps every node's size, so the positions
            // read from the document stay valid as the others are written.
            for (const { pos } of changing) {
              transaction.setNodeAttribute(pos, 'checked', checked);
            }
            dispatch(transaction);
          }

          return true;
        },

      clearCompletedTasks:
        () =>
        ({ state, dispatch }) => {
          const ranges = completedRanges(state.doc);
          if (ranges.length === 0) return false;

          if (dispatch) {
            const transaction = state.tr;
            for (const range of ranges) transaction.delete(range.from, range.to);
            dispatch(transaction);
          }

          return true;
        },
    };
  },
});
