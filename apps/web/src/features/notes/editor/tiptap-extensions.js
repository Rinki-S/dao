import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

/**
 * Build a fresh extension array for each editor instance. Markdown remains the
 * external value; Tiptap's ProseMirror document exists only while editing.
 *
 * @param {{ placeholder?: string }} [options]
 */
export function createMarkdownEditorExtensions({ placeholder = 'Write a note…' } = {}) {
  return [
    StarterKit.configure({
      codeBlock: {
        enableTabIndentation: true,
        tabSize: 2,
      },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      },
    }),
    TableKit.configure({
      table: {
        resizable: false,
      },
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
      a11y: {
        checkboxLabel: (_node, checked) =>
          checked ? 'Mark task as incomplete' : 'Mark task as complete',
      },
    }),
    Image.configure({
      allowBase64: false,
      inline: false,
    }),
    Placeholder.configure({
      placeholder,
      showOnlyCurrent: true,
    }),
    Markdown.configure({
      indentation: {
        style: 'space',
        size: 2,
      },
      markedOptions: {
        gfm: true,
        breaks: false,
      },
    }),
  ];
}
