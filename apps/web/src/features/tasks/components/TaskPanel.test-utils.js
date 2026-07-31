if (typeof Element !== 'undefined' && !Element.prototype.getAnimations) {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  });
}

export const currentWorkspace = {
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

export function projectFixture(overrides = {}) {
  return {
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
    ...overrides,
  };
}

export function taskFixture(overrides = {}) {
  return {
    id: 'task-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    parentId: null,
    title: 'Review component migration',
    description: 'Check the row trigger behavior.',
    status: 'todo',
    priority: 'high',
    dueDate: null,
    createdAt: '2026-05-25T00:00:00Z',
    updatedAt: '2026-05-25T00:00:00Z',
    deletedAt: null,
    version: 1,
    syncStatus: 'synced',
    ...overrides,
  };
}
