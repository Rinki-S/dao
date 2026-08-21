import { beforeEach, describe, expect, it } from 'vitest';
import { getWorkspaceRecents, pruneRecents, readRecents, recordRecent } from './storage.js';

describe('recents storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('deduplicates and orders recently opened entities', () => {
    let items = recordRecent([], {
      workspaceId: 'workspace-1',
      entityType: 'note',
      entityId: 'note-1',
      title: 'First',
    });
    items = recordRecent(items, {
      workspaceId: 'workspace-1',
      entityType: 'note',
      entityId: 'note-1',
      title: 'Renamed',
    });

    expect(readRecents()).toHaveLength(1);
    expect(getWorkspaceRecents(items, 'workspace-1')[0].title).toBe('Renamed');
  });

  it('prunes missing notes and tasks', () => {
    const items = [
      {
        workspaceId: 'workspace-1',
        entityType: 'note',
        entityId: 'missing',
        title: 'Missing',
        openedAt: new Date().toISOString(),
      },
    ];

    expect(pruneRecents(items, { notes: [], tasks: [] })).toEqual([]);
  });
});
