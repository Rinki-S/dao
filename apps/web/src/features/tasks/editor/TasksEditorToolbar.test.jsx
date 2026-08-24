import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownRichEditor } from '@/features/notes/editor/MarkdownRichEditor.jsx';

import { TaskAnnotations } from './task-annotation-extension.js';
import { localToday, shiftDate } from './task-annotations.js';
import { TasksEditorToolbar } from './TasksEditorToolbar.jsx';

const EXTENSIONS = [TaskAnnotations];

async function openTasks(markdown, onMarkdownChange = vi.fn()) {
  render(
    <MarkdownRichEditor
      ariaLabel="Task list"
      extraExtensions={EXTENSIONS}
      initialMarkdown={markdown}
      renderToolbar={(props) => <TasksEditorToolbar {...props} />}
      onMarkdownChange={onMarkdownChange}
    />,
  );

  const editor = await screen.findByRole('textbox', { name: 'Task list' });
  await userEvent.click(editor);

  return { editor, onMarkdownChange };
}

describe('TasksEditorToolbar', () => {
  it('renders a stable loading toolbar before the editor is ready', () => {
    render(<TasksEditorToolbar editor={null} />);

    expect(screen.getByRole('toolbar', { name: 'Task list' })).toHaveAttribute('aria-busy', 'true');
  });

  it('offers the task controls and none of the note formatting', async () => {
    await openTasks('- [ ] Ship v2\n');

    for (const label of ['Task', 'Outdent', 'Indent', 'Due date', 'Priority', 'Undo', 'Redo']) {
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

  it('cannot clear a date that is not there', async () => {
    await openTasks('- [ ] Ship v2\n');

    await userEvent.click(screen.getByRole('button', { name: 'Due date' }));

    expect(await screen.findByRole('menuitem', { name: 'No date' })).toHaveAttribute(
      'data-disabled',
    );
  });
});
