import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCalendarEvent,
  IconChevronDown,
  IconFlag,
  IconIndentDecrease,
  IconIndentIncrease,
  IconListCheck,
  IconSquareCheck,
} from '@tabler/icons-react';
import { useEditorState } from '@tiptap/react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu.jsx';
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from '@/components/ui/toolbar.jsx';
import {
  EditorToolbarButton,
  EditorToolbarShell,
} from '@/features/notes/editor/EditorToolbarShell.jsx';
import { findAnnotationRange, localToday, shiftDate } from './task-annotations.js';
import { selectedTaskItems } from './task-selection.js';

// Relative offsets rather than fixed dates: "tomorrow" has to stay tomorrow in
// a window that has been open since yesterday.
const DUE_CHOICES = [
  { id: 'today', label: 'Today', days: 0 },
  { id: 'tomorrow', label: 'Tomorrow', days: 1 },
  { id: 'next-week', label: 'In a week', days: 7 },
];

const PRIORITY_CHOICES = [
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];

function currentLineText(editor) {
  const block = editor.state.selection.$from.parent;
  return block.isTextblock ? block.textContent : '';
}

function MenuControl({ children, disabled, icon: Icon, isActive, label }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Menu open={isOpen} onOpenChange={setIsOpen}>
      <MenuTrigger
        render={
          <ToolbarButton
            render={
              <Button
                aria-label={label}
                aria-pressed={isActive || undefined}
                disabled={disabled}
                size="sm"
                type="button"
                variant={isActive ? 'secondary' : 'ghost'}
                onClick={() => {
                  if (!isOpen) setIsOpen(true);
                }}
              />
            }
          />
        }
      >
        <Icon aria-hidden="true" />
        <IconChevronDown aria-hidden="true" data-icon="inline-end" />
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuGroup>{children}</MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

function ReadyToolbar({ editor, saveStatus, saveStatusLabel }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current || current.isDestroyed || !current.view) {
        return {
          canClearCompleted: false,
          canOutdent: false,
          canIndent: false,
          canRedo: false,
          canUndo: false,
          hasDue: false,
          hasPriority: false,
          isTaskList: false,
          selectedCount: 0,
        };
      }

      const line = currentLineText(current);

      return {
        canClearCompleted: current.can().clearCompletedTasks(),
        canOutdent: current.can().liftListItem('taskItem'),
        canIndent: current.can().sinkListItem('taskItem'),
        canRedo: current.can().chain().redo().run(),
        canUndo: current.can().chain().undo().run(),
        hasDue: findAnnotationRange(line, 'due') !== null,
        hasPriority: findAnnotationRange(line, 'priority') !== null,
        isTaskList: current.isActive('taskList'),
        selectedCount: selectedTaskItems(current.state).length,
      };
    },
  });

  const setDue = (date) => editor.chain().focus().setTaskDue(date).run();
  const setPriority = (level) => editor.chain().focus().setTaskPriority(level).run();
  const setChecked = (checked) => editor.chain().focus().setTasksChecked(checked).run();
  const isBatch = state.selectedCount > 1;

  return (
    <EditorToolbarShell saveStatus={saveStatus} saveStatusLabel={saveStatusLabel}>
      <Toolbar aria-label="Task list">
        <ToolbarGroup>
          <EditorToolbarButton
            editor={editor}
            icon={IconListCheck}
            isActive={state.isTaskList}
            label="Task"
            onClick={(current) => current.chain().focus().toggleTaskList().run()}
          />
        </ToolbarGroup>
        <ToolbarSeparator />
        {/* Indentation is what makes a subtask, so it is a first-class control
            here rather than something you have to know Tab does. */}
        <ToolbarGroup>
          <EditorToolbarButton
            disabled={!state.canOutdent}
            editor={editor}
            icon={IconIndentDecrease}
            label="Outdent"
            onClick={(current) => current.chain().focus().liftListItem('taskItem').run()}
          />
          <EditorToolbarButton
            disabled={!state.canIndent}
            editor={editor}
            icon={IconIndentIncrease}
            label="Indent"
            onClick={(current) => current.chain().focus().sinkListItem('taskItem').run()}
          />
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <MenuControl icon={IconCalendarEvent} isActive={state.hasDue} label="Due date">
            {DUE_CHOICES.map((choice) => (
              <MenuItem
                key={choice.id}
                onClick={() => setDue(shiftDate(localToday(), choice.days))}
              >
                {choice.label}
              </MenuItem>
            ))}
            <MenuItem disabled={!state.hasDue} onClick={() => setDue(null)}>
              No date
            </MenuItem>
          </MenuControl>
          <MenuControl icon={IconFlag} isActive={state.hasPriority} label="Priority">
            {PRIORITY_CHOICES.map((choice) => (
              <MenuItem key={choice.id} onClick={() => setPriority(choice.id)}>
                {choice.label}
              </MenuItem>
            ))}
            <MenuItem disabled={!state.hasPriority} onClick={() => setPriority(null)}>
              None
            </MenuItem>
          </MenuControl>
          <MenuControl icon={IconSquareCheck} label="Status">
            <MenuItem onClick={() => setChecked(true)}>Mark done</MenuItem>
            <MenuItem onClick={() => setChecked(false)}>Mark not done</MenuItem>
            <MenuSeparator />
            {/* Named for the list, not the selection: unlike everything above
                it, this one reaches past what is selected. */}
            <MenuItem
              disabled={!state.canClearCompleted}
              variant="destructive"
              onClick={() => editor.chain().focus().clearCompletedTasks().run()}
            >
              Delete finished tasks
            </MenuItem>
          </MenuControl>
        </ToolbarGroup>
        {/* Batch actions look identical to single ones, so the count is the
            only thing saying how far the next click reaches. */}
        {isBatch ? (
          // self-center because the toolbar aligns its children by stretching
          // them, and a badge has a height of its own to stretch to — without
          // this it sits at the top of the bar while every control is centred.
          <Badge aria-live="polite" className="self-center" variant="secondary">
            {state.selectedCount} tasks
          </Badge>
        ) : null}
        <ToolbarSeparator />
        <ToolbarGroup>
          <EditorToolbarButton
            disabled={!state.canUndo}
            editor={editor}
            icon={IconArrowBackUp}
            label="Undo"
            onClick={(current) => current.chain().focus().undo().run()}
          />
          <EditorToolbarButton
            disabled={!state.canRedo}
            editor={editor}
            icon={IconArrowForwardUp}
            label="Redo"
            onClick={(current) => current.chain().focus().redo().run()}
          />
        </ToolbarGroup>
      </Toolbar>
    </EditorToolbarShell>
  );
}

/**
 * The task list's own toolbar. A note's controls — headings, bold, links — are
 * noise on a list of checkboxes; what a task needs is nesting, a date and a
 * priority.
 */
export function TasksEditorToolbar({ editor, saveStatus, saveStatusLabel }) {
  if (!editor) return <div aria-busy="true" aria-label="Task list" role="toolbar" />;
  return <ReadyToolbar editor={editor} saveStatus={saveStatus} saveStatusLabel={saveStatusLabel} />;
}
