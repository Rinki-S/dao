import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import {
  findAnnotationRange,
  formatDueAnnotation,
  formatPriorityAnnotation,
  localToday,
  parseTaskAnnotations,
} from './task-annotations.js';
import './task-annotations.css';

const taskAnnotationPluginKey = new PluginKey('taskAnnotations');

export const ANNOTATION_CLASS = 'dao-task-annotation';

function classNamesFor(annotation, isDone) {
  const names = [ANNOTATION_CLASS, `${ANNOTATION_CLASS}--${annotation.kind}`];

  if (annotation.kind === 'due') {
    names.push(`${ANNOTATION_CLASS}--due-${annotation.status}`);
  } else {
    names.push(`${ANNOTATION_CLASS}--priority-${annotation.level}`);
  }

  // A finished task should not keep shouting about a date that has passed.
  if (isDone) names.push(`${ANNOTATION_CLASS}--done`);

  return names.join(' ');
}

function isInsideCheckedTask(doc, pos) {
  const resolved = doc.resolve(pos);

  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).type.name === 'taskItem') {
      return resolved.node(depth).attrs.checked === true;
    }
  }

  return false;
}

function buildDecorations(doc, today) {
  const decorations = [];

  doc.descendants((node, pos) => {
    if (!node.isText) return true;

    const annotations = parseTaskAnnotations(node.text, { today });
    if (annotations.length === 0) return false;

    const isDone = isInsideCheckedTask(doc, pos);

    for (const annotation of annotations) {
      decorations.push(
        Decoration.inline(pos + annotation.from, pos + annotation.to, {
          class: classNamesFor(annotation, isDone),
        }),
      );
    }

    return false;
  });

  return DecorationSet.create(doc, decorations);
}

// Annotations are written into the line's own text, so an offset in that string
// has to be a document position too. That holds only while the block contains
// nothing but text — an inline image would shift everything after it.
function annotationTarget(state) {
  const { $from } = state.selection;
  const block = $from.parent;

  if (!block.isTextblock) return null;
  if (block.content.size !== block.textContent.length) return null;

  return { start: $from.start(), text: block.textContent };
}

function annotationTransaction(state, kind, replacement) {
  const target = annotationTarget(state);
  if (!target) return null;

  const range = findAnnotationRange(target.text, kind);
  const transaction = state.tr;

  if (range) {
    const from = target.start + range.from;
    const to = target.start + range.to;

    if (replacement) {
      transaction.insertText(replacement, from, to);
    } else {
      // Take the separating space along, or removing a date leaves a gap in
      // the middle of the sentence.
      const eatsSpace = range.from > 0 && target.text[range.from - 1] === ' ';
      transaction.delete(eatsSpace ? from - 1 : from, to);
    }

    return transaction;
  }

  // Nothing to clear is not a failure — the line is already how it was asked to be.
  if (!replacement) return transaction;

  const needsSpace = target.text.length > 0 && !/\s$/.test(target.text);
  transaction.insertText(
    needsSpace ? ` ${replacement}` : replacement,
    target.start + target.text.length,
  );

  return transaction;
}

function annotationCommand(kind, format) {
  return (value) =>
    ({ state, dispatch }) => {
      const transaction = annotationTransaction(state, kind, value ? format(value) : null);
      if (!transaction) return false;

      dispatch?.(transaction);
      return true;
    };
}

/**
 * Render `@due(...)` and `!high` as chips.
 *
 * These are decorations, not nodes or marks: they exist only in the view, so
 * they need no serialization rule and cannot rewrite the Markdown on disk. The
 * text a task carries stays exactly what the user typed, readable in any other
 * editor.
 */
export const TaskAnnotations = Extension.create({
  name: 'taskAnnotations',

  addOptions() {
    // A function rather than a date, so a long-running window still compares
    // against the day it is actually on.
    return { getToday: localToday };
  },

  // Setting a date or a priority edits the line's text, exactly as typing it
  // would. There is no hidden state a toolbar could put out of step with the file.
  addCommands() {
    return {
      setTaskDue: annotationCommand('due', formatDueAnnotation),
      setTaskPriority: annotationCommand('priority', formatPriorityAnnotation),
    };
  },

  addProseMirrorPlugins() {
    const { getToday } = this.options;

    return [
      new Plugin({
        key: taskAnnotationPluginKey,
        state: {
          init(_config, { doc }) {
            return buildDecorations(doc, getToday());
          },
          apply(transaction, previous) {
            if (!transaction.docChanged) return previous;
            return buildDecorations(transaction.doc, getToday());
          },
        },
        props: {
          decorations(state) {
            return taskAnnotationPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});
