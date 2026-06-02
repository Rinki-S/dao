import { describe, expect, it } from 'vitest';

import {
  createNoteTab,
  createProjectTab,
  createSurfaceTab,
  getActiveTab,
  getNextActiveTabIdAfterClose,
  openOrActivateTab,
} from './app-tabs.js';

describe('app tab model helpers', () => {
  it('creates a surface tab', () => {
    expect(createSurfaceTab({ id: 'tasks', label: 'Tasks' })).toEqual({
      id: 'tasks',
      title: 'Tasks',
      surfaceId: 'tasks',
      resourceType: 'surface',
      resourceId: null,
    });
  });

  it('creates a project tab', () => {
    expect(createProjectTab({ id: 'project-1', name: 'Dao Project' })).toEqual({
      id: 'project:project-1',
      title: 'Dao Project',
      surfaceId: 'project-contents',
      resourceType: 'project',
      resourceId: 'project-1',
    });
  });

  it('creates a note tab', () => {
    expect(createNoteTab({ id: 'note-1', title: 'README' })).toEqual({
      id: 'note:note-1',
      title: 'README',
      surfaceId: 'note-editor',
      resourceType: 'note',
      resourceId: 'note-1',
    });
  });

  it('opens a new tab and sets it active', () => {
    const openTabs = [createSurfaceTab({ id: 'tasks', label: 'Tasks' })];
    const nextTab = createNoteTab({ id: 'note-1', title: 'README' });

    expect(openOrActivateTab(openTabs, 'tasks', nextTab)).toEqual({
      openTabs: [...openTabs, nextTab],
      activeTabId: 'note:note-1',
    });
  });

  it('activates an existing tab without duplicating it', () => {
    const openTabs = [
      createSurfaceTab({ id: 'tasks', label: 'Tasks' }),
      createNoteTab({ id: 'note-1', title: 'README' }),
    ];

    const result = openOrActivateTab(
      openTabs,
      'tasks',
      createNoteTab({ id: 'note-1', title: 'README' }),
    );

    expect(result.openTabs).toBe(openTabs);
    expect(result).toEqual({
      openTabs,
      activeTabId: 'note:note-1',
    });
  });

  it('returns the active tab or null', () => {
    const openTabs = [
      createSurfaceTab({ id: 'tasks', label: 'Tasks' }),
      createNoteTab({ id: 'note-1', title: 'README' }),
    ];

    expect(getActiveTab(openTabs, 'note:note-1')).toEqual(openTabs[1]);
    expect(getActiveTab(openTabs, 'missing')).toBeNull();
  });

  it('selects the next active tab id after close', () => {
    const openTabs = [
      createSurfaceTab({ id: 'tasks', label: 'Tasks' }),
      createProjectTab({ id: 'project-1', name: 'Dao Project' }),
      createNoteTab({ id: 'note-1', title: 'README' }),
    ];

    expect(
      getNextActiveTabIdAfterClose(openTabs, 'project:project-1', 'project:project-1'),
    ).toBe('tasks');
    expect(getNextActiveTabIdAfterClose(openTabs, 'tasks', 'tasks')).toBe(
      'project:project-1',
    );
    expect(getNextActiveTabIdAfterClose(openTabs, 'tasks', 'note:note-1')).toBe(
      'note:note-1',
    );
    expect(getNextActiveTabIdAfterClose([openTabs[0]], 'tasks', 'tasks')).toBe('');
  });
});
