import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteProject, updateProject } from './api.js';

function projectResponse(overrides = {}) {
  return {
    id: 'project-1',
    workspaceId: 'workspace-1',
    parentId: null,
    name: 'Dao Project',
    description: '',
    folderPath: '/tmp/dao-test/dao-project',
    status: 'active',
    startedAt: null,
    endedAt: null,
    createdAt: '2026-05-25T00:00:00Z',
    updatedAt: '2026-05-25T00:00:00Z',
    deletedAt: null,
    version: 1,
    syncStatus: 'local',
    ...overrides,
  };
}

describe('projects api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updates a project through the project endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(projectResponse({ name: 'Renamed Project', description: 'Updated' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const project = await updateProject('project-1', {
      name: ' Renamed Project ',
      description: ' Updated ',
    });

    expect(project.name).toBe('Renamed Project');
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: expect.any(String),
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'Renamed Project',
      description: 'Updated',
    });
  });

  it('deletes a project through the project endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteProject('project-1', { deleteNotes: true });

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deleteNotes: true }),
    });
  });

  it('throws when deleting a project fails', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: 'project not found' }, { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteProject('project-1')).rejects.toThrow('Failed to delete project: 404');
  });
});
