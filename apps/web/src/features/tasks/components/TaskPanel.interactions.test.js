import { createElement } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listProjects } from '../../projects/api.js';
import { createTask, deleteTask, listTasks, updateTask, updateTaskStatus } from '../api.js';
import { TaskPanel } from './TaskPanel.jsx';
import { currentWorkspace, projectFixture, taskFixture } from './TaskPanel.test-utils.js';

vi.mock('../../projects/api.js', () => ({
  listProjects: vi.fn(),
}));

vi.mock('../api.js', () => ({
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  listTasks: vi.fn(),
}));

vi.mock('../../activities/events.js', () => ({
  notifyActivityChanged: vi.fn(),
}));

describe('TaskPanel interactions', () => {
  beforeEach(() => {
    listProjects.mockResolvedValue([projectFixture()]);
    listTasks.mockResolvedValue([taskFixture()]);
    createTask.mockResolvedValue(taskFixture());
    updateTask.mockResolvedValue(taskFixture());
    updateTaskStatus.mockResolvedValue(taskFixture({ status: 'done' }));
    deleteTask.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a task from the HeroUI quick add form', async () => {
    const user = userEvent.setup();
    render(createElement(TaskPanel, { currentWorkspace }));

    const titleInput = await screen.findByPlaceholderText('Add a task...');
    await user.type(titleInput, 'Write migration notes');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(createTask).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      projectId: null,
      title: 'Write migration notes',
      description: '',
      priority: 'medium',
      dueDate: null,
    });
  });

  it('keeps the task list mounted when quick add fails', async () => {
    const user = userEvent.setup();
    createTask.mockRejectedValue(new Error('Unable to create task'));

    render(createElement(TaskPanel, { currentWorkspace }));

    const titleInput = await screen.findByPlaceholderText('Add a task...');
    await user.type(titleInput, 'Write failure notes');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Unable to create task')).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.getByText('Review HeroUI migration')).toBeInTheDocument();
    expect(titleInput).toHaveValue('Write failure notes');
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
    expect(listTasks).toHaveBeenCalledTimes(1);
  });

  it('keeps the task list mounted while creating a child todo', async () => {
    const user = userEvent.setup();
    let resolveTaskReload;

    listTasks.mockResolvedValueOnce([taskFixture()]).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTaskReload = resolve;
        }),
    );

    render(createElement(TaskPanel, { currentWorkspace }));

    const addChildButton = await screen.findByRole('button', {
      name: 'Add child todo to Review HeroUI migration',
    });

    await user.click(addChildButton);
    await user.type(await screen.findByLabelText('Child todo for Review HeroUI migration'), 'Ship');
    await user.click(screen.getAllByRole('button', { name: 'Add' }).at(-1));

    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledTimes(2);
    });

    expect(screen.queryByText('Loading tasks...')).not.toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Tasks' })).toBeInTheDocument();

    resolveTaskReload([
      taskFixture({
        status: 'doing',
        version: 2,
      }),
      taskFixture({
        id: 'task-2',
        parentId: 'task-1',
        title: 'Ship',
        description: '',
        status: 'todo',
      }),
    ]);
  });

  it('keeps the child todo form open when creating a child todo fails', async () => {
    const user = userEvent.setup();
    createTask.mockRejectedValue(new Error('Unable to create child todo'));

    render(createElement(TaskPanel, { currentWorkspace }));

    const addChildButton = await screen.findByRole('button', {
      name: 'Add child todo to Review HeroUI migration',
    });

    await user.click(addChildButton);
    const childInput = await screen.findByLabelText('Child todo for Review HeroUI migration');
    await user.type(childInput, 'ShipChildTodo');
    await user.click(screen.getAllByRole('button', { name: 'Add' }).at(-1));

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Unable to create child todo')).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.getByText('Review HeroUI migration')).toBeInTheDocument();
    expect(childInput).toHaveValue('ShipChildTodo');
    expect(
      screen.getByRole('button', { name: 'Add child todo to Review HeroUI migration' }),
    ).toBeEnabled();
    expect(listTasks).toHaveBeenCalledTimes(1);
  });

  it('toggles a todo task checkbox to done', async () => {
    const user = userEvent.setup();
    updateTaskStatus.mockResolvedValue(taskFixture({ status: 'done' }));

    render(createElement(TaskPanel, { currentWorkspace }));

    await user.click(
      await screen.findByRole('checkbox', { name: 'Toggle Review HeroUI migration' }),
    );

    await waitFor(() => {
      expect(updateTaskStatus).toHaveBeenCalledWith('task-1', { status: 'done' });
    });
  });

  it('clears checkbox pending state and keeps the task list mounted when toggle fails', async () => {
    const user = userEvent.setup();
    updateTaskStatus.mockRejectedValue(new Error('Unable to update task status'));

    render(createElement(TaskPanel, { currentWorkspace }));

    const checkbox = await screen.findByRole('checkbox', {
      name: 'Toggle Review HeroUI migration',
    });

    await user.click(checkbox);

    await waitFor(() => {
      expect(updateTaskStatus).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Unable to update task status')).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.getByText('Review HeroUI migration')).toBeInTheDocument();
    expect(checkbox).toBeEnabled();
    expect(checkbox).not.toBeChecked();
    expect(listTasks).toHaveBeenCalledTimes(1);
  });

  it('toggles a child todo checkbox with the child task id', async () => {
    const user = userEvent.setup();
    updateTaskStatus.mockResolvedValue(taskFixture({ id: 'task-2', status: 'done' }));
    listTasks.mockResolvedValueOnce([
      taskFixture({
        status: 'doing',
      }),
      taskFixture({
        id: 'task-2',
        parentId: 'task-1',
        title: 'Check child checkbox',
        description: '',
        status: 'todo',
      }),
    ]);

    render(createElement(TaskPanel, { currentWorkspace }));

    await user.click(
      await screen.findByRole('button', { name: 'Expand details for Review HeroUI migration' }),
    );
    await user.click(await screen.findByRole('checkbox', { name: 'Toggle Check child checkbox' }));

    await waitFor(() => {
      expect(updateTaskStatus).toHaveBeenCalledWith('task-2', { status: 'done' });
    });
  });

  it('toggles an indeterminate doing parent task checkbox to done', async () => {
    const user = userEvent.setup();
    updateTaskStatus.mockResolvedValue(taskFixture({ status: 'done' }));
    listTasks.mockResolvedValueOnce([
      taskFixture({
        status: 'doing',
      }),
      taskFixture({
        id: 'task-2',
        parentId: 'task-1',
        title: 'Incomplete child',
        description: '',
        status: 'todo',
      }),
      taskFixture({
        id: 'task-3',
        parentId: 'task-1',
        title: 'Complete child',
        description: '',
        status: 'done',
      }),
    ]);

    render(createElement(TaskPanel, { currentWorkspace }));

    const parentCheckbox = await screen.findByRole('checkbox', {
      name: 'Toggle Review HeroUI migration',
    });

    expect(parentCheckbox).toBePartiallyChecked();

    await user.click(parentCheckbox);

    await waitFor(() => {
      expect(updateTaskStatus).toHaveBeenCalledWith('task-1', { status: 'done' });
    });
  });

  it('opens a right-click task menu and edits the task', async () => {
    const user = userEvent.setup();
    updateTask.mockResolvedValue(
      taskFixture({
        title: 'Updated task',
        description: 'Updated description',
        updatedAt: '2026-05-25T01:00:00Z',
        version: 2,
        syncStatus: 'local',
      }),
    );

    render(createElement(TaskPanel, { currentWorkspace }));

    const trigger = await screen.findByRole('button', {
      name: 'Expand details for Review HeroUI migration',
    });

    fireEvent.contextMenu(trigger, { clientX: 120, clientY: 160 });
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));

    expect(await screen.findByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();

    const titleInput = screen.getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated task');
    await user.clear(screen.getByLabelText('Description'));
    await user.type(screen.getByLabelText('Description'), 'Updated description');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateTask).toHaveBeenCalledWith('task-1', {
      title: 'Updated task',
      description: 'Updated description',
      priority: 'high',
      dueDate: null,
      projectId: 'project-1',
    });
  });

  it('closes the edit task dialog without saving and resets unsaved draft state', async () => {
    const user = userEvent.setup();
    render(createElement(TaskPanel, { currentWorkspace }));

    const trigger = await screen.findByRole('button', {
      name: 'Expand details for Review HeroUI migration',
    });

    fireEvent.contextMenu(trigger, { clientX: 120, clientY: 160 });
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit task' });
    const titleInput = within(dialog).getByLabelText('Title');
    const descriptionInput = within(dialog).getByLabelText('Description');

    await user.clear(titleInput);
    await user.type(titleInput, 'Unsaved task title');
    await user.clear(descriptionInput);
    await user.type(descriptionInput, 'Unsaved task description');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit task' })).not.toBeInTheDocument();
    });
    expect(updateTask).not.toHaveBeenCalled();

    fireEvent.contextMenu(trigger, { clientX: 120, clientY: 160 });
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));

    const reopenedDialog = await screen.findByRole('dialog', { name: 'Edit task' });
    expect(within(reopenedDialog).getByLabelText('Title')).toHaveValue(
      'Review HeroUI migration',
    );
    expect(within(reopenedDialog).getByLabelText('Description')).toHaveValue(
      'Check the row trigger behavior.',
    );
  });

  it('keeps the edit task dialog open and avoids reloading when saving fails', async () => {
    const user = userEvent.setup();
    updateTask.mockRejectedValue(new Error('Unable to update task'));

    render(createElement(TaskPanel, { currentWorkspace }));

    const trigger = await screen.findByRole('button', {
      name: 'Expand details for Review HeroUI migration',
    });

    fireEvent.contextMenu(trigger, { clientX: 120, clientY: 160 });
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit task' });
    const titleInput = within(dialog).getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Failed task update');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledTimes(1);
    });
    expect(await within(dialog).findByText('Unable to update task')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Failed task update');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(listTasks).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation before deleting a task and its child todos from the right-click menu', async () => {
    const user = userEvent.setup();
    deleteTask.mockResolvedValue(undefined);
    listTasks.mockResolvedValueOnce([
      taskFixture({
        status: 'doing',
      }),
      taskFixture({
        id: 'task-2',
        parentId: 'task-1',
        title: 'Check context menu',
        description: '',
        status: 'todo',
      }),
      taskFixture({
        id: 'task-3',
        parentId: 'task-1',
        title: 'Check delete modal',
        description: '',
        status: 'done',
      }),
    ]);

    render(createElement(TaskPanel, { currentWorkspace }));

    const trigger = await screen.findByRole('button', {
      name: 'Expand details for Review HeroUI migration',
    });

    fireEvent.contextMenu(trigger, { clientX: 120, clientY: 160 });
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(deleteTask).not.toHaveBeenCalled();
    const deleteDialog = await screen.findByRole('dialog', { name: 'Delete task' });
    expect(deleteDialog).toBeInTheDocument();
    expect(within(deleteDialog).getByText('Review HeroUI migration')).toBeInTheDocument();
    expect(within(deleteDialog).getByText(/and 2 child todos/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteTask).toHaveBeenCalledWith('task-1');
  });

  it('cancels task deletion without calling the API and clears stale delete dialog state', async () => {
    const user = userEvent.setup();
    listTasks.mockResolvedValueOnce([
      taskFixture({
        status: 'doing',
      }),
      taskFixture({
        id: 'task-2',
        parentId: 'task-1',
        title: 'Check stale delete state',
        description: '',
        status: 'todo',
      }),
    ]);

    render(createElement(TaskPanel, { currentWorkspace }));

    const parentTrigger = await screen.findByRole('button', {
      name: 'Expand details for Review HeroUI migration',
    });

    fireEvent.contextMenu(parentTrigger, { clientX: 120, clientY: 160 });
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const parentDeleteDialog = await screen.findByRole('dialog', { name: 'Delete task' });
    expect(within(parentDeleteDialog).getByText('Review HeroUI migration')).toBeInTheDocument();

    await user.click(within(parentDeleteDialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Delete task' })).not.toBeInTheDocument();
    });
    expect(deleteTask).not.toHaveBeenCalled();

    await user.click(parentTrigger);
    const childTitle = await screen.findByText('Check stale delete state');

    fireEvent.contextMenu(childTitle, { clientX: 140, clientY: 220 });
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const childDeleteDialog = await screen.findByRole('dialog', { name: 'Delete task' });
    expect(within(childDeleteDialog).getByText('Check stale delete state')).toBeInTheDocument();
    expect(within(childDeleteDialog).queryByText('Review HeroUI migration')).toBeNull();

    await user.click(within(childDeleteDialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Delete task' })).not.toBeInTheDocument();
    });
    expect(deleteTask).not.toHaveBeenCalled();
  });

  it('shows a page error and avoids reloading when deleting a task fails', async () => {
    const user = userEvent.setup();
    deleteTask.mockRejectedValue(new Error('Unable to delete task'));

    render(createElement(TaskPanel, { currentWorkspace }));

    const trigger = await screen.findByRole('button', {
      name: 'Expand details for Review HeroUI migration',
    });

    fireEvent.contextMenu(trigger, { clientX: 120, clientY: 160 });
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const deleteDialog = await screen.findByRole('dialog', { name: 'Delete task' });
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(deleteTask).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Unable to delete task')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Delete task' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('grid', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.getByText('Review HeroUI migration')).toBeInTheDocument();
    expect(listTasks).toHaveBeenCalledTimes(1);
  });
});
