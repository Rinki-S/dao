import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconCircleCheck,
  IconCode,
  IconItalic,
  IconList,
  IconListCheck,
  IconListNumbers,
} from '@tabler/icons-react';
import { useEditorState } from '@tiptap/react';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from '@/components/ui/toolbar.jsx';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip.jsx';
import { MarkdownBlockTypeControl } from './MarkdownBlockTypeControl.jsx';
import { MarkdownLinkControl } from './MarkdownLinkControl.jsx';

function EditorButton({ disabled = false, editor, icon: Icon, isActive = false, label, onClick }) {
  const button = (
    <ToolbarButton
      render={
        <Button
          aria-label={label}
          aria-pressed={isActive || undefined}
          disabled={disabled}
          size="icon-sm"
          type="button"
          variant={isActive ? 'secondary' : 'ghost'}
          onClick={() => onClick(editor)}
        />
      }
    >
      <Icon aria-hidden="true" />
    </ToolbarButton>
  );
  return (
    <Tooltip>
      <TooltipTrigger delay={300} render={button} />
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}

function ReadyToolbar({ editor, saveStatus, saveStatusLabel }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current || current.isDestroyed || !current.view) {
        return {
          canRedo: false,
          canUndo: false,
          isBold: false,
          isBulletList: false,
          isCode: false,
          isItalic: false,
          isInTable: false,
          isLink: false,
          isOrderedList: false,
          isTaskList: false,
        };
      }
      return {
        canRedo: current.can().chain().redo().run(),
        canUndo: current.can().chain().undo().run(),
        isBold: current.isActive('bold'),
        isBulletList: current.isActive('bulletList'),
        isCode: current.isActive('code'),
        isItalic: current.isActive('italic'),
        isInTable: current.isActive('table'),
        isLink: current.isActive('link'),
        isOrderedList: current.isActive('orderedList'),
        isTaskList: current.isActive('taskList'),
      };
    },
  });

  return (
    <div className="flex items-center gap-2 border-b p-2">
      <Toolbar aria-label="Markdown formatting">
        <ToolbarGroup>
          <MarkdownBlockTypeControl disabled={state.isInTable} editor={editor} />
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <EditorButton
            editor={editor}
            icon={IconBold}
            isActive={state.isBold}
            label="Bold"
            onClick={(current) => current.chain().focus().toggleBold().run()}
          />
          <EditorButton
            editor={editor}
            icon={IconItalic}
            isActive={state.isItalic}
            label="Italic"
            onClick={(current) => current.chain().focus().toggleItalic().run()}
          />
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <EditorButton
            disabled={state.isInTable}
            editor={editor}
            icon={IconList}
            isActive={state.isBulletList}
            label="Bullet list"
            onClick={(current) => current.chain().focus().toggleBulletList().run()}
          />
          <EditorButton
            disabled={state.isInTable}
            editor={editor}
            icon={IconListNumbers}
            isActive={state.isOrderedList}
            label="Ordered list"
            onClick={(current) => current.chain().focus().toggleOrderedList().run()}
          />
          <EditorButton
            disabled={state.isInTable}
            editor={editor}
            icon={IconListCheck}
            isActive={state.isTaskList}
            label="Task list"
            onClick={(current) => current.chain().focus().toggleTaskList().run()}
          />
          <EditorButton
            editor={editor}
            icon={IconCode}
            isActive={state.isCode}
            label="Inline code"
            onClick={(current) => current.chain().focus().toggleCode().run()}
          />
          <MarkdownLinkControl editor={editor} isActive={state.isLink} />
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <EditorButton
            disabled={!state.canUndo}
            editor={editor}
            icon={IconArrowBackUp}
            label="Undo"
            onClick={(current) => current.chain().focus().undo().run()}
          />
          <EditorButton
            disabled={!state.canRedo}
            editor={editor}
            icon={IconArrowForwardUp}
            label="Redo"
            onClick={(current) => current.chain().focus().redo().run()}
          />
        </ToolbarGroup>
      </Toolbar>
      {saveStatusLabel ? (
        <Badge
          aria-live="polite"
          variant={
            saveStatus === 'failed' ? 'error' : saveStatus === 'saved' ? 'success' : 'secondary'
          }
        >
          <IconCircleCheck aria-hidden="true" />
          {saveStatusLabel}
        </Badge>
      ) : null}
    </div>
  );
}

export function MarkdownEditorToolbar({ editor, saveStatus, saveStatusLabel }) {
  if (!editor) return <div aria-busy="true" aria-label="Markdown formatting" role="toolbar" />;
  return <ReadyToolbar editor={editor} saveStatus={saveStatus} saveStatusLabel={saveStatusLabel} />;
}
