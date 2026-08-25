/**
 * The tasks a selection acts on.
 *
 * Every task whose own line the selection reaches — one entry per task,
 * whether the selection covers the whole line or a single character of it,
 * and subtasks inside the selection included. A caret yields the one task it
 * sits in, so acting on one task and acting on many are the same code path.
 *
 * @returns {Array<{ node: import('@tiptap/pm/model').Node, pos: number, line: import('@tiptap/pm/model').Node, lineFrom: number }>}
 */
export function selectedTaskItems(state) {
  const { from, to } = state.selection;
  const items = [];

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'taskItem') return true;

    const line = node.firstChild;
    if (!line?.isTextblock) return true;

    // nodesBetween reports ancestors too, so a caret in a subtask arrives here
    // once for that subtask and again for every task above it. Only the tasks
    // whose own line the selection reaches are being acted on.
    const lineFrom = pos + 2;
    const lineTo = lineFrom + line.content.size;
    if (from > lineTo || to < lineFrom) return true;

    items.push({ node, pos, line, lineFrom });
    return true;
  });

  return items;
}
