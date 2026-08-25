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
import { selectedTaskItems } from './task-selection.js';
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

/**
 * The task lines a selection writes annotations into.
 *
 * Annotations are written into the line's own text, so an offset in that
 * string has to be a document position too. That holds only while the line is
 * nothing but text — an inline image would shift everything after it.
 */
function annotationTargets(state) {
  return selectedTaskItems(state)
    .filter(({ line }) => line.content.size === line.textContent.length)
    .map(({ line, lineFrom }) => ({ start: lineFrom, text: line.textContent }));
}

function applyAnnotation(transaction, target, kind, replacement) {
  const range = findAnnotationRange(target.text, kind);

  if (range) {
    const from = target.start + range.from;
    const to = target.start + range.to;

    if (replacement) {
      transaction.insertText(replacement, from, to);
      return;
    }

    // Take the separating space along, or removing a date leaves a gap in the
    // middle of the sentence.
    const eatsSpace = range.from > 0 && target.text[range.from - 1] === ' ';
    transaction.delete(eatsSpace ? from - 1 : from, to);
    return;
  }

  // Nothing to clear is not a failure — the line is already how it was asked to be.
  if (!replacement) return;

  const needsSpace = target.text.length > 0 && !/\s$/.test(target.text);
  transaction.insertText(
    needsSpace ? ` ${replacement}` : replacement,
    target.start + target.text.length,
  );
}

function annotationTransaction(state, kind, replacement) {
  const targets = annotationTargets(state);
  if (targets.length === 0) return null;

  const transaction = state.tr;

  // Back to front: editing an earlier line shifts every position after it, and
  // the positions were all read from the document as it is now.
  for (const target of targets.toReversed()) {
    applyAnnotation(transaction, target, kind, replacement);
  }

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
