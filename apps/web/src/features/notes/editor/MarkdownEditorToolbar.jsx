import { Button, Input, Label, Popover, TextField, Tooltip } from '@heroui/react';
import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import CheckListIcon from '@hugeicons/core-free-icons/CheckListIcon';
import CodeIcon from '@hugeicons/core-free-icons/CodeIcon';
import CodeSquareIcon from '@hugeicons/core-free-icons/CodeSquareIcon';
import Heading02Icon from '@hugeicons/core-free-icons/Heading02Icon';
import LeftToRightBlockQuoteIcon from '@hugeicons/core-free-icons/LeftToRightBlockQuoteIcon';
import LeftToRightListBulletIcon from '@hugeicons/core-free-icons/LeftToRightListBulletIcon';
import LeftToRightListNumberIcon from '@hugeicons/core-free-icons/LeftToRightListNumberIcon';
import Link01Icon from '@hugeicons/core-free-icons/Link01Icon';
import Redo02Icon from '@hugeicons/core-free-icons/Redo02Icon';
import TableIcon from '@hugeicons/core-free-icons/TableIcon';
import TextBoldIcon from '@hugeicons/core-free-icons/TextBoldIcon';
import TextItalicIcon from '@hugeicons/core-free-icons/TextItalicIcon';
import TextStrikethroughIcon from '@hugeicons/core-free-icons/TextStrikethroughIcon';
import Undo02Icon from '@hugeicons/core-free-icons/Undo02Icon';
import { useEditorState } from '@tiptap/react';

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

function LinkToolbarControl({ editor, isActive }) {
  const [href, setHref] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenChange = (nextOpen) => {
    if (nextOpen) {
      setHref(editor.getAttributes('link').href ?? '');
    }
    setIsOpen(nextOpen);
  };

  const applyLink = (event) => {
    event.preventDefault();
    const nextHref = href.trim();

    if (nextHref) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: nextHref }).run();
      setIsOpen(false);
    }
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setHref('');
    setIsOpen(false);
  };

  return (
    <Popover isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button
        aria-label={isActive ? 'Edit link' : 'Add link'}
        aria-pressed={isActive || undefined}
        className="dao-markdown-toolbar__button"
        isIconOnly
        size="sm"
        type="button"
        variant={isActive ? 'secondary' : 'ghost'}
      >
        <HugeiconsIcon aria-hidden="true" className="size-4" icon={Link01Icon} />
      </Button>
      <Popover.Content className="w-80" placement="bottom">
        <Popover.Dialog className="dao-markdown-link-popover">
          <form className="dao-markdown-link-popover__form" onSubmit={applyLink}>
            <TextField fullWidth value={href} onChange={setHref}>
              <Label>Link URL</Label>
              <Input autoFocus placeholder="https://example.com" variant="secondary" />
            </TextField>
            <div className="dao-markdown-link-popover__actions">
              {isActive && (
                <Button size="sm" type="button" variant="ghost" onPress={removeLink}>
                  Remove
                </Button>
              )}
              <Button size="sm" type="button" variant="ghost" onPress={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button isDisabled={href.trim() === ''} size="sm" type="submit">
                Apply
              </Button>
            </div>
          </form>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
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
          isHeading: false,
          isItalic: false,
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
        isHeading: currentEditor.isActive('heading', { level: 2 }),
        isItalic: currentEditor.isActive('italic'),
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
          <LinkToolbarControl editor={editor} isActive={state.isLink} />
        </div>
        <ToolbarDivider />
        <div className="dao-markdown-toolbar__group">
          <ToolbarButton
            editor={editor}
            icon={Heading02Icon}
            isActive={state.isHeading}
            label="Heading 2"
            onPress={(currentEditor) =>
              currentEditor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          />
          <ToolbarButton
            editor={editor}
            icon={LeftToRightListBulletIcon}
            isActive={state.isBulletList}
            label="Bullet list"
            onPress={(currentEditor) => currentEditor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={LeftToRightListNumberIcon}
            isActive={state.isOrderedList}
            label="Ordered list"
            onPress={(currentEditor) => currentEditor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={CheckListIcon}
            isActive={state.isTaskList}
            label="Task list"
            onPress={(currentEditor) => currentEditor.chain().focus().toggleTaskList().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={LeftToRightBlockQuoteIcon}
            isActive={state.isBlockquote}
            label="Blockquote"
            onPress={(currentEditor) => currentEditor.chain().focus().toggleBlockquote().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={CodeSquareIcon}
            isActive={state.isCodeBlock}
            label="Code block"
            onPress={(currentEditor) => currentEditor.chain().focus().toggleCodeBlock().run()}
          />
          <ToolbarButton
            editor={editor}
            icon={TableIcon}
            label="Insert table"
            onPress={(currentEditor) =>
              currentEditor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
          />
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
