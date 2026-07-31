import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBlockquote,
  IconBold,
  IconCode,
  IconCodeDots,
  IconItalic,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconStrikethrough,
} from '@tabler/icons-react';
import { useEditorState } from '@tiptap/react';

import { Button } from '@/components/ui/button.jsx';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.jsx';
import { MarkdownBlockTypeControl } from './MarkdownBlockTypeControl.jsx';
import { MarkdownInsertControl } from './MarkdownInsertControl.jsx';
import { MarkdownLinkControl } from './MarkdownLinkControl.jsx';

function ToolbarButton({ disabled = false, editor, icon: Icon, isActive = false, label, onClick }) {
  const button = (
    <Button
      aria-label={label}
      aria-pressed={isActive || undefined}
      className="dao-markdown-toolbar__button"
      disabled={disabled}
      size="icon-sm"
      type="button"
      variant={isActive ? 'secondary' : 'ghost'}
      onClick={() => {
        onClick(editor);
      }}
    >
      <Icon aria-hidden="true" className="size-4" data-icon="inline-start" />
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger delay={300} render={button} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarDivider() {
  return <span aria-hidden="true" className="dao-markdown-toolbar__divider" />;
}

function ReadyMarkdownEditorToolbar({ editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor || currentEditor.isDestroyed) {
        return {
          canRedo: false,
          canUndo: false,
          isBlockquote: false,
          isBold: false,
          isBulletList: false,
          isCode: false,
          isCodeBlock: false,
          isItalic: false,
          isInTable: false,
          isLink: false,
          isOrderedList: false,
          isStrike: false,
          isTaskList: false,
        };
      }

      return {
        canRedo: currentEditor.can().chain().redo().run(),
        canUndo: currentEditor.can().chain().undo().run(),
        isBlockquote: currentEditor.isActive('blockquote'),
        isBold: currentEditor.isActive('bold'),
        isBulletList: currentEditor.isActive('bulletList'),
        isCode: currentEditor.isActive('code'),
        isCodeBlock: currentEditor.isActive('codeBlock'),
        isItalic: currentEditor.isActive('italic'),
        isInTable: currentEditor.isActive('table'),
        isLink: currentEditor.isActive('link'),
        isOrderedList: currentEditor.isActive('orderedList'),
        isStrike: currentEditor.isActive('strike'),
        isTaskList: currentEditor.isActive('taskList'),
      };
    },
  });

  return (
    <div aria-label="Markdown formatting" className="dao-markdown-toolbar" role="toolbar">
      <div className="dao-markdown-toolbar__inner">
        <div className="dao-markdown-toolbar__group">
          <ToolbarButton
            editor={editor}
            icon={IconArrowBackUp}
            disabled={!state.canUndo}
            label="Undo"
            onClick={(currentEditor) => currentEditor.chain().focus().undo().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={IconArrowForwardUp}
            disabled={!state.canRedo}
            label="Redo"
            onClick={(currentEditor) => currentEditor.chain().focus().redo().run()}
          />
        </div>
        <ToolbarDivider />
        <div className="dao-markdown-toolbar__group">
          <MarkdownBlockTypeControl disabled={state.isInTable} editor={editor} />
        </div>
        <ToolbarDivider />
        <div className="dao-markdown-toolbar__group">
          <ToolbarButton
            editor={editor}
            icon={IconBold}
            isActive={state.isBold}
            label="Bold"
            onClick={(currentEditor) => currentEditor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={IconItalic}
            isActive={state.isItalic}
            label="Italic"
            onClick={(currentEditor) => currentEditor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={IconStrikethrough}
            isActive={state.isStrike}
            label="Strikethrough"
            onClick={(currentEditor) => currentEditor.chain().focus().toggleStrike().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={IconCode}
            isActive={state.isCode}
            label="Inline code"
            onClick={(currentEditor) => currentEditor.chain().focus().toggleCode().run()}
          />
          <MarkdownLinkControl editor={editor} isActive={state.isLink} />
        </div>
        <ToolbarDivider />
        <div className="dao-markdown-toolbar__group">
          <ToolbarButton
            editor={editor}
            icon={IconList}
            isActive={state.isBulletList}
            disabled={state.isInTable}
            label="Bullet list"
            onClick={(currentEditor) => currentEditor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={IconListNumbers}
            isActive={state.isOrderedList}
            disabled={state.isInTable}
            label="Ordered list"
            onClick={(currentEditor) => currentEditor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={IconListCheck}
            isActive={state.isTaskList}
            disabled={state.isInTable}
            label="Task list"
            onClick={(currentEditor) => currentEditor.chain().focus().toggleTaskList().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={IconBlockquote}
            isActive={state.isBlockquote}
            disabled={state.isInTable}
            label="Blockquote"
            onClick={(currentEditor) => currentEditor.chain().focus().toggleBlockquote().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={IconCodeDots}
            isActive={state.isCodeBlock}
            disabled={state.isInTable}
            label="Code block"
            onClick={(currentEditor) => currentEditor.chain().focus().toggleCodeBlock().run()}
          />
        </div>
        <ToolbarDivider />
        <div className="dao-markdown-toolbar__group">
          <MarkdownInsertControl disabled={state.isInTable} editor={editor} />
        </div>
      </div>
    </div>
  );
}

export function MarkdownEditorToolbar({ editor }) {
  if (!editor) {
    return (
      <div
        aria-busy="true"
        aria-label="Markdown formatting"
        className="dao-markdown-toolbar"
        role="toolbar"
      >
        <div className="dao-markdown-toolbar__inner" />
      </div>
    );
  }

  return <ReadyMarkdownEditorToolbar editor={editor} />;
}
