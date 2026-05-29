import { createElement } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTask, deleteTask, listTasks, updateTask } from '../api.js';
import { TaskPanel } from './TaskPanel.jsx';

vi.mock('../../projects/api.js', () => ({
  listProjects: vi.fn(async () => [
    {
      id: 'project-1',
      workspaceId: 'workspace-1',
      name: 'Dao Project',
      description: '',
      folderPath: '/tmp/dao-test/personal-workspace-1/dao-project',
      status: 'active',
      startedAt: null,
      endedAt: null,
      createdAt: '2026-05-25T00:00:00Z',
      updatedAt: '2026-05-25T00:00:00Z',
      deletedAt: null,
      version: 1,
      syncStatus: 'synced',
    },
  ]),
}));

vi.mock('../api.js', () => ({
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  listTasks: vi.fn(async () => [
    {
      id: 'task-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      parentId: null,
      title: 'Review HeroUI migration',
      description: 'Check the row trigger behavior.',
      status: 'todo',
      priority: 'high',
      dueDate: null,
      createdAt: '2026-05-25T00:00:00Z',
      updatedAt: '2026-05-25T00:00:00Z',
      deletedAt: null,
      version: 1,
      syncStatus: 'synced',
    },
  ]),
}));

vi.mock('../../activities/events.js', () => ({
  notifyActivityChanged: vi.fn(),
}));

const currentWorkspace = {
  id: 'workspace-1',
  name: 'Personal',
  description: '',
  rootPath: '/tmp/dao-test/personal-workspace-1',
  createdAt: '2026-05-25T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
  deletedAt: null,
  version: 1,
  syncStatus: 'synced',
};

describe('TaskPanel interactions', () => {
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

    listTasks
      .mockResolvedValueOnce([
        {
          id: 'task-1',
          workspaceId: 'workspace-1',
          projectId: 'project-1',
          parentId: null,
          title: 'Review HeroUI migration',
          description: 'Check the row trigger behavior.',
          status: 'todo',
          priority: 'high',
          dueDate: null,
          createdAt: '2026-05-25T00:00:00Z',
          updatedAt: '2026-05-25T00:00:00Z',
          deletedAt: null,
          version: 1,
          syncStatus: 'synced',
        },
      ])
      .mockImplementationOnce(
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
      {
        id: 'task-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        parentId: null,
        title: 'Review HeroUI migration',
        description: 'Check the row trigger behavior.',
        status: 'doing',
        priority: 'high',
        dueDate: null,
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        deletedAt: null,
        version: 2,
        syncStatus: 'synced',
      },
      {
        id: 'task-2',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        parentId: 'task-1',
        title: 'Ship',
        description: '',
        status: 'todo',
        priority: 'high',
        dueDate: null,
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        deletedAt: null,
        version: 1,
        syncStatus: 'synced',
      },
    ]);
  });

  it('opens a right-click task menu and edits the task', async () => {
    const user = userEvent.setup();
    updateTask.mockResolvedValue({
      id: 'task-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      parentId: null,
      title: 'Updated task',
      description: 'Updated description',
      status: 'todo',
      priority: 'high',
      dueDate: null,
      createdAt: '2026-05-25T00:00:00Z',
      updatedAt: '2026-05-25T01:00:00Z',
      deletedAt: null,
      version: 2,
      syncStatus: 'local',
    });

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
      {
        id: 'task-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        parentId: null,
        title: 'Review HeroUI migration',
        description: 'Check the row trigger behavior.',
        status: 'doing',
        priority: 'high',
        dueDate: null,
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        deletedAt: null,
        version: 1,
        syncStatus: 'synced',
      },
      {
        id: 'task-2',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        parentId: 'task-1',
        title: 'Check context menu',
        description: '',
        status: 'todo',
        priority: 'high',
        dueDate: null,
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        deletedAt: null,
        version: 1,
        syncStatus: 'synced',
      },
      {
        id: 'task-3',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        parentId: 'task-1',
        title: 'Check delete modal',
        description: '',
        status: 'done',
        priority: 'high',
        dueDate: null,
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        deletedAt: null,
        version: 1,
        syncStatus: 'synced',
      },
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
