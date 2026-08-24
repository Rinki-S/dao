import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { localToday, parseTaskAnnotations } from './task-annotations.js';
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
