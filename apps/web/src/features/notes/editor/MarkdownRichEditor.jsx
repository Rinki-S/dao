import { useId } from 'react';
import { IconFileCode } from '@tabler/icons-react';
import { EditorContent, useEditor } from '@tiptap/react';

import { getMarkdownCompatibility } from './markdown-compatibility.js';
import { getDurableMarkdown } from './markdown-serialization.js';
import { MarkdownEditorToolbar } from './MarkdownEditorToolbar.jsx';
import { createMarkdownEditorExtensions } from './tiptap-extensions.js';
import './markdown-editor.css';

function MarkdownSourceFallback({ ariaLabel, initialMarkdown, onMarkdownChange, reasons }) {
  const descriptionId = useId();

  return (
    <div className="dao-markdown-editor dao-markdown-editor--source">
      <div className="dao-markdown-source-header" role="note">
        <div className="dao-markdown-source-header__message">
          <IconFileCode aria-hidden="true" className="size-4 shrink-0" />
          <div className="dao-markdown-source-header__copy">
            <span className="dao-markdown-source-header__title">Source mode</span>
            <span id={descriptionId}>
              Preserving {reasons.join(', ')} that rich-text editing may rewrite.
            </span>
          </div>
        </div>
      </div>
      <textarea
        aria-describedby={descriptionId}
        aria-label={ariaLabel}
        className="dao-markdown-source-textarea"
        defaultValue={initialMarkdown}
        onChange={(event) => {
          onMarkdownChange(event.target.value);
        }}
        placeholder="Write markdown…"
        spellCheck={false}
      />
    </div>
  );
}

function TiptapMarkdownEditor({ ariaLabel, initialMarkdown, onMarkdownChange }) {
  const editor = useEditor({
    content: initialMarkdown,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        'aria-multiline': 'true',
        class: 'dao-markdown-editor__prose',
        role: 'textbox',
        spellcheck: 'true',
      },
    },
    extensions: createMarkdownEditorExtensions(),
    onUpdate: ({ editor: currentEditor }) => {
      onMarkdownChange(getDurableMarkdown(currentEditor));
    },
  });

  return (
    <div className="dao-markdown-editor dao-markdown-editor--rich">
      <MarkdownEditorToolbar editor={editor} />
      <EditorContent className="dao-markdown-editor__content" editor={editor} />
    </div>
  );
}

/**
 * Rich Markdown editor boundary. The caller owns persistence and should key
 * this component by note id so each note receives a fresh editor/history.
 */
export function MarkdownRichEditor({
  initialMarkdown,
  onMarkdownChange,
  ariaLabel = 'Markdown note content',
}) {
  const compatibility = getMarkdownCompatibility(initialMarkdown);

  if (!compatibility.isRichTextSafe) {
    return (
      <MarkdownSourceFallback
        ariaLabel={ariaLabel}
        initialMarkdown={initialMarkdown}
        onMarkdownChange={onMarkdownChange}
        reasons={compatibility.reasons}
      />
    );
  }

  return (
    <TiptapMarkdownEditor
      ariaLabel={ariaLabel}
      initialMarkdown={initialMarkdown}
      onMarkdownChange={onMarkdownChange}
    />
  );
}
