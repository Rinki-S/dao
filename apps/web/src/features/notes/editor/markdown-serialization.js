const TIPTAP_TABLE_CELL_LINE_SEPARATOR = '\u001f';

/**
 * Convert Tiptap's Markdown output into a durable Markdown string.
 *
 * The table extension uses U+001F internally between multiple block children
 * in one cell. GFM tables cannot represent those blocks, so persist a normal
 * space instead of leaking an invisible control character into the note file.
 *
 * @param {{ getMarkdown: () => string }} editor
 * @returns {string}
 */
export function getDurableMarkdown(editor) {
  return editor.getMarkdown().replaceAll(TIPTAP_TABLE_CELL_LINE_SEPARATOR, ' ');
}
