import { Button, Tooltip } from '@heroui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import CheckListIcon from '@hugeicons/core-free-icons/CheckListIcon';
import CodeIcon from '@hugeicons/core-free-icons/CodeIcon';
import CodeSquareIcon from '@hugeicons/core-free-icons/CodeSquareIcon';
import LeftToRightBlockQuoteIcon from '@hugeicons/core-free-icons/LeftToRightBlockQuoteIcon';
import LeftToRightListBulletIcon from '@hugeicons/core-free-icons/LeftToRightListBulletIcon';
import LeftToRightListNumberIcon from '@hugeicons/core-free-icons/LeftToRightListNumberIcon';
import Redo02Icon from '@hugeicons/core-free-icons/Redo02Icon';
import TextBoldIcon from '@hugeicons/core-free-icons/TextBoldIcon';
import TextItalicIcon from '@hugeicons/core-free-icons/TextItalicIcon';
import TextStrikethroughIcon from '@hugeicons/core-free-icons/TextStrikethroughIcon';
import Undo02Icon from '@hugeicons/core-free-icons/Undo02Icon';
import { useEditorState } from '@tiptap/react';

import { MarkdownBlockTypeControl } from './MarkdownBlockTypeControl.jsx';
import { MarkdownInsertControl } from './MarkdownInsertControl.jsx';
import { MarkdownLinkControl } from './MarkdownLinkControl.jsx';

function ToolbarButton({ editor, icon, label, isActive = false, isDisabled = false, onPress }) {
  return (
    <Tooltip delay={300}>
      <Button
        aria-label={label}
        aria-pressed={isActive || undefined}
        className="dao-markdown-toolbar__button"
        isDisabled={isDisabled}
        isIconOnly
        size="sm"
        type="button"
        variant={isActive ? 'secondary' : 'ghost'}
        onPress={() => {
          onPress(editor);
        }}
      >
        <HugeiconsIcon aria-hidden="true" className="size-4" icon={icon} />
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
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
            icon={Undo02Icon}
            isDisabled={!state.canUndo}
            label="Undo"
            onPress={(currentEditor) => currentEditor.chain().focus().undo().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={Redo02Icon}
            isDisabled={!state.canRedo}
            label="Redo"
            onPress={(currentEditor) => currentEditor.chain().focus().redo().run()}
          />
        </div>
        <ToolbarDivider />
        <div className="dao-markdown-toolbar__group">
          <MarkdownBlockTypeControl editor={editor} isDisabled={state.isInTable} />
        </div>
        <ToolbarDivider />
        <div className="dao-markdown-toolbar__group">
          <ToolbarButton
            editor={editor}
            icon={TextBoldIcon}
            isActive={state.isBold}
            label="Bold"
            onPress={(currentEditor) => currentEditor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={TextItalicIcon}
            isActive={state.isItalic}
            label="Italic"
            onPress={(currentEditor) => currentEditor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={TextStrikethroughIcon}
            isActive={state.isStrike}
            label="Strikethrough"
            onPress={(currentEditor) => currentEditor.chain().focus().toggleStrike().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={CodeIcon}
            isActive={state.isCode}
            label="Inline code"
            onPress={(currentEditor) => currentEditor.chain().focus().toggleCode().run()}
          />
          <MarkdownLinkControl editor={editor} isActive={state.isLink} />
        </div>
        <ToolbarDivider />
        <div className="dao-markdown-toolbar__group">
          <ToolbarButton
            editor={editor}
            icon={LeftToRightListBulletIcon}
            isActive={state.isBulletList}
            isDisabled={state.isInTable}
            label="Bullet list"
            onPress={(currentEditor) => currentEditor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={LeftToRightListNumberIcon}
            isActive={state.isOrderedList}
            isDisabled={state.isInTable}
            label="Ordered list"
            onPress={(currentEditor) => currentEditor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={CheckListIcon}
            isActive={state.isTaskList}
            isDisabled={state.isInTable}
            label="Task list"
            onPress={(currentEditor) => currentEditor.chain().focus().toggleTaskList().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={LeftToRightBlockQuoteIcon}
            isActive={state.isBlockquote}
            isDisabled={state.isInTable}
            label="Blockquote"
            onPress={(currentEditor) => currentEditor.chain().focus().toggleBlockquote().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={CodeSquareIcon}
            isActive={state.isCodeBlock}
            isDisabled={state.isInTable}
            label="Code block"
            onPress={(currentEditor) => currentEditor.chain().focus().toggleCodeBlock().run()}
          />
        </div>
        <ToolbarDivider />
        <div className="dao-markdown-toolbar__group">
          <MarkdownInsertControl editor={editor} isDisabled={state.isInTable} />
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
