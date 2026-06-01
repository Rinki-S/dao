export function createSurfaceTab(surface) {
  return {
    id: surface.id,
    title: surface.label,
    surfaceId: surface.id,
    resourceType: 'surface',
    resourceId: null,
  };
}

export function createProjectTab(project) {
  return {
    id: `project:${project.id}`,
    title: project.name,
    surfaceId: 'project-contents',
    resourceType: 'project',
    resourceId: project.id,
    workspaceId: project.workspaceId,
  };
}

export function createNoteTab(note) {
  return {
    id: `note:${note.id}`,
    title: note.title,
    surfaceId: 'note-editor',
    resourceType: 'note',
    resourceId: note.id,
    workspaceId: note.workspaceId,
  };
}

export function getActiveTab(openTabs, activeTabId) {
  return openTabs.find((tab) => tab.id === activeTabId) ?? null;
}

export function openOrActivateTab(openTabs, activeTabId, nextTab) {
  void activeTabId;

  if (openTabs.some((tab) => tab.id === nextTab.id)) {
    return {
      openTabs,
      activeTabId: nextTab.id,
    };
  }

  return {
    openTabs: [...openTabs, nextTab],
    activeTabId: nextTab.id,
  };
}

export function getNextActiveTabIdAfterClose(openTabs, closingTabId, activeTabId) {
  if (closingTabId !== activeTabId) {
    return activeTabId;
  }

  const closingTabIndex = openTabs.findIndex((tab) => tab.id === closingTabId);

  if (closingTabIndex === -1 || openTabs.length <= 1) {
    return '';
  }

  const nextTab = openTabs[closingTabIndex - 1] ?? openTabs[closingTabIndex + 1];

  return nextTab?.id ?? '';
}
