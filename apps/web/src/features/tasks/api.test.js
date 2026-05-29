import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteTask, updateTask } from './api.js';

describe('tasks api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updates a task through the task endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: 'task-1',
        workspaceId: 'workspace-1',
        projectId: null,
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
      }),
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
});
