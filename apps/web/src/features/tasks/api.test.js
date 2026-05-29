import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTask, deleteTask, listTasks, updateTask, updateTaskStatus } from './api.js';

function taskResponse(overrides = {}) {
  return {
    id: 'task-1',
    workspaceId: 'workspace-1',
    projectId: null,
    parentId: null,
    title: 'Task',
    description: '',
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    createdAt: '2026-05-25T00:00:00Z',
    updatedAt: '2026-05-25T00:00:00Z',
    deletedAt: null,
    version: 1,
    syncStatus: 'local',
    ...overrides,
  };
}

describe('tasks api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists tasks through the task endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json([
        taskResponse({ id: 'task-1', title: 'First task' }),
        taskResponse({ id: 'task-2', title: 'Second task' }),
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const tasks = await listTasks();

    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe('First task');
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks', {
      headers: {},
    });
  });

  it('rejects invalid task list responses', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json([
        {
          id: 'task-1',
          title: 'Missing fields',
        },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listTasks()).rejects.toThrow();
  });

  it('creates a task through the task endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(taskResponse({ title: 'Write tests', description: 'Cover API requests' }), {
        status: 201,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const task = await createTask({
      workspaceId: ' workspace-1 ',
      projectId: null,
      parentId: null,
      title: ' Write tests ',
      description: ' Cover API requests ',
      priority: 'high',
      dueDate: null,
    });

    expect(task.title).toBe('Write tests');
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: expect.any(String),
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      workspaceId: 'workspace-1',
      projectId: null,
      parentId: null,
      title: 'Write tests',
      description: 'Cover API requests',
      priority: 'high',
      dueDate: null,
    });
  });

  it('updates task status through the task status endpoint', async () => {
    const fetchMock = vi.fn(async () => Response.json(taskResponse({ status: 'done' })));
    vi.stubGlobal('fetch', fetchMock);

    const task = await updateTaskStatus('task-1', { status: 'done' });

    expect(task.status).toBe('done');
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/task-1/status', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'done' }),
    });
  });

  it('updates a task through the task endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        taskResponse({
          title: 'Updated task',
          description: 'Updated description',
          priority: 'high',
          updatedAt: '2026-05-25T01:00:00Z',
          version: 2,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const task = await updateTask('task-1', {
      title: ' Updated task ',
      description: 'Updated description',
      priority: 'high',
      dueDate: null,
      projectId: null,
    });

    expect(task.title).toBe('Updated task');
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/task-1', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: expect.any(String),
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      title: 'Updated task',
      description: 'Updated description',
      priority: 'high',
      dueDate: null,
      projectId: null,
    });
  });

  it('deletes a task through the task endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteTask('task-1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks/task-1',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  it('throws when deleting a task fails', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: 'task not found' }, { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteTask('task-1')).rejects.toThrow('Failed to delete task: 404');
  });
});
