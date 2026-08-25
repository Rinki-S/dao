import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownRichEditor } from '@/features/notes/editor/MarkdownRichEditor.jsx';

import { TaskAnnotations } from './task-annotation-extension.js';
import { localToday, shiftDate } from './task-annotations.js';
import { TaskBatch } from './task-batch-extension.js';
import { TasksEditorToolbar } from './TasksEditorToolbar.jsx';

const EXTENSIONS = [TaskAnnotations, TaskBatch];

async function openTasks(markdown, onMarkdownChange = vi.fn()) {
  // The toolbar is handed the editor instance, which is also the only way a
  // test can place a selection: jsdom has no real one to drag.
  let instance = null;

  render(
    <MarkdownRichEditor
      ariaLabel="Task list"
      extraExtensions={EXTENSIONS}
      initialMarkdown={markdown}
      renderToolbar={(props) => {
        instance = props.editor;
        return <TasksEditorToolbar {...props} />;
      }}
      onMarkdownChange={onMarkdownChange}
    />,
  );

  const editor = await screen.findByRole('textbox', { name: 'Task list' });
  await userEvent.click(editor);

  function positionOf(word) {
    let found = null;

    instance.state.doc.descendants((node, pos) => {
      if (found !== null || !node.isText || !node.text.includes(word)) return true;
      found = pos + node.text.indexOf(word) + 1;
      return false;
    });

    return found;
  }

  return {
    editor,
    onMarkdownChange,
    caretOn: (word) => instance.commands.setTextSelection(positionOf(word)),
    selectAcross: (from, to) =>
      instance.commands.setTextSelection({ from: positionOf(from), to: positionOf(to) }),
  };
}

describe('TasksEditorToolbar', () => {
  it('renders a stable loading toolbar before the editor is ready', () => {
    render(<TasksEditorToolbar editor={null} />);

    expect(screen.getByRole('toolbar', { name: 'Task list' })).toHaveAttribute('aria-busy', 'true');
  });

  it('offers the task controls and none of the note formatting', async () => {
    await openTasks('- [ ] Ship v2\n');

    for (const label of [
      'Task',
      'Outdent',
      'Indent',
      'Due date',
      'Priority',
      'Status',
      'Undo',
      'Redo',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    // A checkbox list has no use for headings, bold or links.
    for (const label of ['Bold', 'Italic', 'Add link']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it('writes a due date into the task the caret is on', async () => {
    const { onMarkdownChange } = await openTasks('- [ ] Ship v2\n');

    await userEvent.click(screen.getByRole('button', { name: 'Due date' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Tomorrow' }));

    const tomorrow = shiftDate(localToday(), 1);
    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(
        expect.stringContaining(`- [ ] Ship v2 @due(${tomorrow})`),
      );
    });
  });

  it('writes a priority and then takes it away again', async () => {
    const { onMarkdownChange } = await openTasks('- [ ] Ship v2\n');

    await userEvent.click(screen.getByRole('button', { name: 'Priority' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'High' }));

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining('- [ ] Ship v2 !high'));
    });

    await userEvent.click(screen.getByRole('button', { name: 'Priority' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'None' }));

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenLastCalledWith(expect.stringContaining('- [ ] Ship v2\n'));
    });
    expect(onMarkdownChange).not.toHaveBeenLastCalledWith(expect.stringContaining('!high'));
  });

  it('ticks every selected task from one menu click', async () => {
    const { onMarkdownChange, selectAcross } = await openTasks(
      '- [ ] First\n- [ ] Second\n- [ ] Third\n',
    );
    selectAcross('First', 'Second');

    await userEvent.click(screen.getByRole('button', { name: 'Status' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mark done' }));

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledWith(
        expect.stringContaining('- [x] First\n- [x] Second\n- [ ] Third'),
      );
    });
  });

  it('says how many tasks the next click will reach', async () => {
    const { caretOn, selectAcross } = await openTasks('- [ ] First\n- [ ] Second\n');

    caretOn('First');
    expect(screen.queryByText(/tasks$/)).not.toBeInTheDocument();

    selectAcross('First', 'Second');
    expect(await screen.findByText('2 tasks')).toBeInTheDocument();
  });

  it('cannot delete finished tasks when none are finished', async () => {
    const { caretOn } = await openTasks('- [ ] First\n- [ ] Second\n');
    caretOn('First');

    await userEvent.click(screen.getByRole('button', { name: 'Status' }));

    expect(await screen.findByRole('menuitem', { name: 'Delete finished tasks' })).toHaveAttribute(
      'data-disabled',
    );
  });

  it('deletes the finished tasks and leaves the rest', async () => {
    const { caretOn, onMarkdownChange } = await openTasks(
      '- [ ] First\n- [x] Second\n- [x] Third\n',
    );
    caretOn('First');

    await userEvent.click(screen.getByRole('button', { name: 'Status' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete finished tasks' }));

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenLastCalledWith(expect.stringContaining('- [ ] First'));
    });
    expect(onMarkdownChange).not.toHaveBeenLastCalledWith(expect.stringContaining('Second'));
  });

  it('cannot clear a date that is not there', async () => {
    await openTasks('- [ ] Ship v2\n');

    await userEvent.click(screen.getByRole('button', { name: 'Due date' }));

    expect(await screen.findByRole('menuitem', { name: 'No date' })).toHaveAttribute(
      'data-disabled',
    );
  });
});
