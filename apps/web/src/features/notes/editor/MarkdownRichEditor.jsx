import { useId } from 'react';
import { IconFileCode } from '@tabler/icons-react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';

import { getMarkdownCompatibility } from './markdown-compatibility.js';
import { getDurableMarkdown } from './markdown-serialization.js';
import { MarkdownEditorToolbar } from './MarkdownEditorToolbar.jsx';
import { createMarkdownEditorExtensions } from './tiptap-extensions.js';
import './markdown-editor.css';

function MarkdownSourceFallback({ ariaLabel, initialMarkdown, onMarkdownChange, reasons }) {
  const descriptionId = useId();

  return (
    <div className="h-full overflow-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <IconFileCode aria-hidden="true" />
            Source mode
          </CardTitle>
          <CardDescription id={descriptionId}>
            Preserving {reasons.join(', ')} that rich-text editing may rewrite.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <Textarea
            aria-describedby={descriptionId}
            aria-label={ariaLabel}
            defaultValue={initialMarkdown}
            placeholder="Write markdown…"
            rows={24}
            spellCheck={false}
            onChange={(event) => {
              onMarkdownChange(event.target.value);
            }}
          />
        </CardPanel>
      </Card>
    </div>
  );
}

function TiptapMarkdownEditor({
  ariaLabel,
  initialMarkdown,
  onMarkdownChange,
  saveStatus,
  saveStatusLabel,
}) {
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <MarkdownEditorToolbar
        editor={editor}
        saveStatus={saveStatus}
        saveStatusLabel={saveStatusLabel}
      />
      <EditorContent className="min-h-0 flex-1 overflow-auto" editor={editor} />
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
  saveStatus,
  saveStatusLabel,
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
      saveStatus={saveStatus}
      saveStatusLabel={saveStatusLabel}
    />
  );
}
