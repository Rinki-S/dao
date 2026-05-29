import { createElement } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listProjects } from '../../projects/api.js';
import { createTask, deleteTask, listTasks, updateTask } from '../api.js';
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
});
