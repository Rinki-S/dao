# Global Workspace Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-persistent global workspace tabs that start empty, open/activate pages and resources by identity, support close behavior, and replace the current page-heading header.

**Architecture:** Keep tab state in `App.jsx` as runtime UI navigation state. Extract pure tab operations to a small helper for deterministic tests, and keep `AppTabBar.jsx` presentational. Existing panels continue to own their business data and rendering.

**Tech Stack:** React, JavaScript, HeroUI, Vitest, Testing Library, current Dao extension/surface registry.

---

## File Structure

- Create: `apps/web/src/components/app/app-tabs.js`
  - Pure helpers for creating tab descriptors, opening/activating tabs, resolving active tabs, and choosing the next active tab after close.
- Create: `apps/web/src/components/app/app-tabs.test.js`
  - Unit tests for tab identity, dedupe, activation, and close-neighbor behavior.
- Create: `apps/web/src/components/app/AppTabBar.jsx`
  - Presentational tab bar component. Receives `tabs`, `activeTabId`, `onSelectTab`, and `onCloseTab`.
- Create: `apps/web/src/components/app/AppTabBar.test.jsx`
  - UI tests for active state, click selection, close button behavior, and empty tab bar label.
- Modify: `apps/web/src/App.jsx`
  - Add `openTabs` and `activeTabId` state.
  - Route sidebar/project/note selections through tab helpers.
  - Replace the current heading header with `AppTabBar`.
  - Render empty state when no tab is active.
- Modify: `apps/web/src/App.test.jsx`
  - Update existing tests from default Tasks startup to empty startup.
  - Add integration coverage for opening, reusing, switching, and closing tabs.

## Task 1: Add Pure Tab Model Helpers

**Files:**
- Create: `apps/web/src/components/app/app-tabs.js`
- Create: `apps/web/src/components/app/app-tabs.test.js`

- [ ] **Step 1: Write failing helper tests**

Create `apps/web/src/components/app/app-tabs.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  createNoteTab,
  createProjectTab,
  createSurfaceTab,
  getActiveTab,
  getNextActiveTabIdAfterClose,
  openOrActivateTab,
} from './app-tabs.js';

describe('app tab model', () => {
  it('creates stable surface, project, and note tab ids', () => {
    expect(createSurfaceTab({ id: 'tasks', label: 'Tasks' })).toEqual({
      id: 'tasks',
      title: 'Tasks',
      surfaceId: 'tasks',
      resourceType: 'surface',
      resourceId: null,
    });

    expect(createProjectTab({ id: 'project-1', name: 'Dao Project' })).toEqual({
      id: 'project:project-1',
      title: 'Dao Project',
      surfaceId: 'project-contents',
      resourceType: 'project',
      resourceId: 'project-1',
    });

    expect(createNoteTab({ id: 'note-1', title: 'README' })).toEqual({
      id: 'note:note-1',
      title: 'README',
      surfaceId: 'note-editor',
      resourceType: 'note',
      resourceId: 'note-1',
    });
  });

  it('opens a new tab and activates it', () => {
    const nextState = openOrActivateTab([], '', createSurfaceTab({ id: 'tasks', label: 'Tasks' }));

    expect(nextState.openTabs).toHaveLength(1);
    expect(nextState.activeTabId).toBe('tasks');
  });

  it('activates an existing tab instead of duplicating it', () => {
    const tasksTab = createSurfaceTab({ id: 'tasks', label: 'Tasks' });
    const settingsTab = createSurfaceTab({ id: 'settings', label: 'Settings' });

    const nextState = openOrActivateTab([tasksTab, settingsTab], 'settings', tasksTab);

    expect(nextState.openTabs).toEqual([tasksTab, settingsTab]);
    expect(nextState.activeTabId).toBe('tasks');
  });

  it('returns the active tab by id', () => {
    const tasksTab = createSurfaceTab({ id: 'tasks', label: 'Tasks' });
    const settingsTab = createSurfaceTab({ id: 'settings', label: 'Settings' });

    expect(getActiveTab([tasksTab, settingsTab], 'settings')).toBe(settingsTab);
    expect(getActiveTab([tasksTab], '')).toBeNull();
    expect(getActiveTab([tasksTab], 'missing')).toBeNull();
  });

  it('selects the left neighbor when closing the active tab', () => {
    const tabs = [
      createSurfaceTab({ id: 'tasks', label: 'Tasks' }),
      createProjectTab({ id: 'project-1', name: 'Dao Project' }),
      createSurfaceTab({ id: 'settings', label: 'Settings' }),
    ];

    expect(getNextActiveTabIdAfterClose(tabs, 'project:project-1', 'project:project-1')).toBe(
      'tasks',
    );
  });

  it('selects the right neighbor when closing the first active tab', () => {
    const tabs = [
      createSurfaceTab({ id: 'tasks', label: 'Tasks' }),
      createSurfaceTab({ id: 'settings', label: 'Settings' }),
    ];

    expect(getNextActiveTabIdAfterClose(tabs, 'tasks', 'tasks')).toBe('settings');
  });

  it('keeps the current active tab when closing an inactive tab', () => {
    const tabs = [
      createSurfaceTab({ id: 'tasks', label: 'Tasks' }),
      createSurfaceTab({ id: 'settings', label: 'Settings' }),
    ];

    expect(getNextActiveTabIdAfterClose(tabs, 'settings', 'tasks')).toBe('tasks');
  });

  it('clears active tab after closing the final tab', () => {
    const tabs = [createSurfaceTab({ id: 'tasks', label: 'Tasks' })];

    expect(getNextActiveTabIdAfterClose(tabs, 'tasks', 'tasks')).toBe('');
  });
});
```

- [ ] **Step 2: Run helper tests and verify failure**

Run:

```bash
cd apps/web
npm test -- app-tabs
```

Expected: FAIL because `app-tabs.js` does not exist.

- [ ] **Step 3: Implement tab helpers**

Create `apps/web/src/components/app/app-tabs.js`:

```js
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
  };
}

export function createNoteTab(note) {
  return {
    id: `note:${note.id}`,
    title: note.title,
    surfaceId: 'note-editor',
    resourceType: 'note',
    resourceId: note.id,
  };
}

export function getActiveTab(openTabs, activeTabId) {
  return openTabs.find((tab) => tab.id === activeTabId) ?? null;
}

export function openOrActivateTab(openTabs, activeTabId, nextTab) {
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

  const closingIndex = openTabs.findIndex((tab) => tab.id === closingTabId);

  if (closingIndex === -1) {
    return activeTabId;
  }

  const leftTab = openTabs[closingIndex - 1];
  const rightTab = openTabs[closingIndex + 1];

  return leftTab?.id ?? rightTab?.id ?? '';
}
```

- [ ] **Step 4: Run helper tests and verify pass**

Run:

```bash
cd apps/web
npm test -- app-tabs
```

Expected: PASS.

- [ ] **Step 5: Commit helper model**

Run:

```bash
git add apps/web/src/components/app/app-tabs.js apps/web/src/components/app/app-tabs.test.js
git commit -m "test: add workspace tab model helpers"
```

## Task 2: Add Presentational AppTabBar

**Files:**
- Create: `apps/web/src/components/app/AppTabBar.jsx`
- Create: `apps/web/src/components/app/AppTabBar.test.jsx`

- [ ] **Step 1: Write failing AppTabBar tests**

Create `apps/web/src/components/app/AppTabBar.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppTabBar } from './AppTabBar.jsx';

const tabs = [
  {
    id: 'tasks',
    title: 'Tasks',
    surfaceId: 'tasks',
    resourceType: 'surface',
    resourceId: null,
  },
  {
    id: 'project:project-1',
    title: 'Dao Project',
    surfaceId: 'project-contents',
    resourceType: 'project',
    resourceId: 'project-1',
  },
];

describe('AppTabBar', () => {
  it('renders an empty state label when no tabs are open', () => {
    render(<AppTabBar tabs={[]} activeTabId="" onSelectTab={vi.fn()} onCloseTab={vi.fn()} />);

    expect(screen.getByText('No tab open')).toBeInTheDocument();
  });

  it('marks the active tab', () => {
    render(
      <AppTabBar
        tabs={tabs}
        activeTabId="project:project-1"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: /Dao Project/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /Tasks/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('selects a tab when clicked', async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();

    render(
      <AppTabBar
        tabs={tabs}
        activeTabId="tasks"
        onSelectTab={onSelectTab}
        onCloseTab={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Dao Project/ }));

    expect(onSelectTab).toHaveBeenCalledWith('project:project-1');
  });

  it('closes a tab without selecting it from the close button click', async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();

    render(
      <AppTabBar
        tabs={tabs}
        activeTabId="tasks"
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Close Dao Project tab' }));

    expect(onCloseTab).toHaveBeenCalledWith('project:project-1');
    expect(onSelectTab).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run AppTabBar tests and verify failure**

Run:

```bash
cd apps/web
npm test -- AppTabBar
```

Expected: FAIL because `AppTabBar.jsx` does not exist.

- [ ] **Step 3: Implement AppTabBar**

Create `apps/web/src/components/app/AppTabBar.jsx`:

```jsx
import { Button } from '@heroui/react';

export function AppTabBar({ tabs, activeTabId, onSelectTab, onCloseTab }) {
  return (
    <div className="flex h-10 shrink-0 items-center overflow-hidden border-b border-border bg-surface px-2">
      {tabs.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">No tab open</p>
      ) : (
        <div
          aria-label="Open tabs"
          className="no-scrollbar flex min-w-0 flex-1 items-end gap-1 overflow-x-auto"
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;

            return (
              <div
                key={tab.id}
                className={`group flex h-8 max-w-56 shrink-0 items-center gap-1 rounded-t-lg border px-2 text-sm transition-colors ${
                  isActive
                    ? 'border-border border-b-surface bg-sidebar text-foreground shadow-sm'
                    : 'border-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <button
                  aria-selected={isActive}
                  className="min-w-0 truncate outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  role="tab"
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                >
                  {tab.title}
                </button>
                <Button
                  aria-label={`Close ${tab.title} tab`}
                  className="size-5 min-w-0 rounded-md p-0 text-muted-foreground opacity-70 transition-opacity hover:text-foreground group-hover:opacity-100"
                  size="sm"
                  type="button"
                  variant="ghost"
                  onPress={() => onCloseTab(tab.id)}
                >
                  <span aria-hidden="true" className="text-sm leading-none">
                    ×
                  </span>
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run AppTabBar tests and verify pass**

Run:

```bash
cd apps/web
npm test -- AppTabBar
```

Expected: PASS.

- [ ] **Step 5: Commit AppTabBar**

Run:

```bash
git add apps/web/src/components/app/AppTabBar.jsx apps/web/src/components/app/AppTabBar.test.jsx
git commit -m "feat: add workspace tab bar"
```

## Task 3: Integrate Tabs Into App Shell

**Files:**
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/App.test.jsx`

- [ ] **Step 1: Update App integration tests for empty startup and surface tabs**

Modify the first two tests in `apps/web/src/App.test.jsx` to assert empty startup and tab-based surface switching.

Replace the test named `renders only the active surface from the sidebar` with:

```jsx
it('starts with no open tabs and opens surfaces from the sidebar', async () => {
  const user = userEvent.setup();

  renderApp();

  expect(await screen.findByText('No tab open')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'No page open' })).toBeInTheDocument();
  expect(screen.queryByRole('grid', { name: 'Tasks' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Tasks' }));

  expect(screen.getByRole('tab', { name: /Tasks/ })).toHaveAttribute('aria-selected', 'true');
  expect(await screen.findByRole('grid', { name: 'Tasks' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Settings' }));

  expect(window.location.hash).toBe('#settings');
  expect(screen.getByRole('tab', { name: /Settings/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Working Directory')).toBeInTheDocument();
  expect(screen.queryByRole('grid', { name: 'Tasks' })).not.toBeInTheDocument();
});
```

Replace the test named `switches surfaces from the command palette` with:

```jsx
it('opens a surface tab from the command palette', async () => {
  const user = userEvent.setup();

  renderApp();

  await screen.findByText('No tab open');
  await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
  await user.type(screen.getByPlaceholderText('Type a command'), 'open settings');
  await user.keyboard('{Enter}');

  expect(window.location.hash).toBe('#settings');
  expect(screen.getByRole('tab', { name: /Settings/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Working Directory')).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument();
});
```

Add this new test after the command palette test:

```jsx
it('reuses existing surface tabs and closes active tabs to the left neighbor', async () => {
  const user = userEvent.setup();

  renderApp();

  await screen.findByText('No tab open');
  await user.click(screen.getByRole('button', { name: 'Tasks' }));
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: 'Tasks' }));

  expect(screen.getAllByRole('tab', { name: /Tasks/ })).toHaveLength(1);
  expect(screen.getByRole('tab', { name: /Tasks/ })).toHaveAttribute('aria-selected', 'true');

  await user.click(screen.getByRole('button', { name: 'Close Tasks tab' }));

  expect(screen.queryByRole('tab', { name: /Tasks/ })).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Settings/ })).toHaveAttribute('aria-selected', 'true');
});
```

Add this new test after that:

```jsx
it('shows the empty state after closing the final tab', async () => {
  const user = userEvent.setup();

  renderApp();

  await screen.findByText('No tab open');
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: 'Close Settings tab' }));

  expect(screen.getByText('No tab open')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'No page open' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run App tests and verify failure**

Run:

```bash
cd apps/web
npm test -- App
```

Expected: FAIL because App still starts on Tasks and `AppTabBar` is not integrated.

- [ ] **Step 3: Import tab utilities and AppTabBar**

Modify the top of `apps/web/src/App.jsx` to include these imports:

```jsx
import { AppTabBar } from '@/components/app/AppTabBar.jsx';
import {
  createNoteTab,
  createProjectTab,
  createSurfaceTab,
  getActiveTab,
  getNextActiveTabIdAfterClose,
  openOrActivateTab,
} from '@/components/app/app-tabs.js';
```

- [ ] **Step 4: Change initial active surface and add tab state**

In `apps/web/src/App.jsx`, replace:

```js
const [activeSurfaceId, setActiveSurfaceId] = useState(() => getSurfaceIdFromHash(surfaces));
```

with:

```js
const [activeSurfaceId, setActiveSurfaceId] = useState('');
const [openTabs, setOpenTabs] = useState([]);
const [activeTabId, setActiveTabId] = useState('');
```

Keep `getSurfaceIdFromHash` for hash changes and command compatibility in this first implementation.

- [ ] **Step 5: Add active tab memo**

After the existing `activeSurface` memo, add:

```js
const activeTab = useMemo(() => getActiveTab(openTabs, activeTabId), [activeTabId, openTabs]);
```

- [ ] **Step 6: Add helper functions inside App**

Add these functions before `handleSelectSurface`:

```js
function applyTab(tab) {
  setActiveSurfaceId(tab.surfaceId);

  if (tab.resourceType === 'project') {
    setSelectedProjectId(tab.resourceId);
    setSelectedNoteId('');
  } else if (tab.resourceType === 'note') {
    setSelectedNoteId(tab.resourceId);
    setSelectedProjectId('');
  } else {
    setSelectedProjectId('');
    setSelectedNoteId('');
  }

  window.history.replaceState(null, '', `#${tab.surfaceId}`);
}

function openTab(tab) {
  setOpenTabs((currentTabs) => {
    const nextState = openOrActivateTab(currentTabs, activeTabId, tab);
    setActiveTabId(nextState.activeTabId);
    return nextState.openTabs;
  });
  applyTab(tab);
}

function handleSelectTab(tabId) {
  const tab = openTabs.find((openTabItem) => openTabItem.id === tabId);

  if (!tab) {
    return;
  }

  setActiveTabId(tab.id);
  applyTab(tab);
}

function handleCloseTab(tabId) {
  const nextActiveTabId = getNextActiveTabIdAfterClose(openTabs, tabId, activeTabId);
  const nextOpenTabs = openTabs.filter((tab) => tab.id !== tabId);

  setOpenTabs(nextOpenTabs);
  setActiveTabId(nextActiveTabId);

  if (!nextActiveTabId) {
    setActiveSurfaceId('');
    setSelectedProjectId('');
    setSelectedNoteId('');
    window.history.replaceState(null, '', window.location.pathname);
    return;
  }

  const nextActiveTab = nextOpenTabs.find((tab) => tab.id === nextActiveTabId);

  if (nextActiveTab) {
    applyTab(nextActiveTab);
  }
}
```

- [ ] **Step 7: Route surface, project, and note selection through tabs**

Replace `handleSelectSurface` with:

```js
function handleSelectSurface(surfaceId) {
  const surface = surfaces.find((nextSurface) => nextSurface.id === surfaceId);

  if (!surface) {
    return;
  }

  openTab(createSurfaceTab(surface));
}
```

Replace `handleSelectProject` with this temporary compatibility version that still accepts the current ProjectTree id callback:

```js
function handleSelectProject(projectId) {
  openTab(
    createProjectTab({
      id: projectId,
      name: 'Project',
    }),
  );
}
```

Replace `handleSelectNote` with this temporary compatibility version that still accepts the current ProjectTree id callback:

```js
function handleSelectNote(noteId) {
  openTab(
    createNoteTab({
      id: noteId,
      title: 'Note',
    }),
  );
}
```

Task 4 replaces both compatibility versions with resource-object callbacks before the resource tab work is complete.

- [ ] **Step 8: Replace heading header with AppTabBar and empty state**

In `apps/web/src/App.jsx`, replace the `<header className="flex h-14 ...">...</header>` block with:

```jsx
<AppTabBar
  tabs={openTabs}
  activeTabId={activeTabId}
  onSelectTab={handleSelectTab}
  onCloseTab={handleCloseTab}
/>
```

Then replace the content section body with an active-tab guard:

```jsx
{!activeTab ? (
  <div className="flex min-h-0 flex-1 items-center justify-center px-8 py-7">
    <div className="max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
      <h1 className="font-heading text-lg font-semibold text-foreground">No page open</h1>
      <p className="mt-2 text-sm text-muted-foreground text-pretty">
        Open a page from the sidebar or command palette to start working in this workspace.
      </p>
    </div>
  </div>
) : activeSurfaceId === 'project-contents' ? (
  <div className="min-h-0 flex-1 overflow-y-auto">
    <ProjectContentsPanel currentWorkspace={currentWorkspace} selectedProjectId={selectedProjectId} />
  </div>
) : activeSurfaceId === 'note-editor' ? (
  <NoteEditorPanel noteId={selectedNoteId} />
) : activeSurfaceId === 'tasks' && activeSurface ? (
  getSurfaceComponent(activeSurface.id, {
    currentWorkspace,
    currentWorkingDirectory: workingDirectory,
    onReplayOnboarding: () => setIsReplayingOnboarding(true),
  })
) : activeSurface ? (
  <div className="min-h-0 flex-1 overflow-y-auto">
    {getSurfaceComponent(activeSurface.id, {
      currentWorkspace,
      currentWorkingDirectory: workingDirectory,
      onReplayOnboarding: () => setIsReplayingOnboarding(true),
    })}
  </div>
) : null}
```

Keep the existing section class logic for `tasks` until tests identify layout regressions. If empty state needs padding, include it in the empty state wrapper as above.

- [ ] **Step 9: Run App tests and fix immediate compile issues**

Run:

```bash
cd apps/web
npm test -- App
```

Expected after compile fixes: tests should still fail only around project/note resource title behavior, which Task 4 handles.

- [ ] **Step 10: Commit App shell integration if surface tests pass**

If the App tests for surface tabs pass and only resource-tab tests are pending for Task 4, commit:

```bash
git add apps/web/src/App.jsx apps/web/src/App.test.jsx
git commit -m "feat: integrate workspace tabs in app shell"
```

If App tests do not pass, do not commit. Fix the integration before continuing.

## Task 4: Pass Resource Titles From ProjectTree

**Files:**
- Modify: `apps/web/src/components/app/ProjectTree.jsx`
- Modify: `apps/web/src/components/app/AppSidebar.jsx`
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/App.test.jsx`

- [ ] **Step 1: Add resource tab integration tests**

In `apps/web/src/App.test.jsx`, change the `/api/notes` fetch mock to return a note:

```js
if (pathname === '/api/notes') {
  return Response.json([
    {
      id: 'note-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      title: 'README',
      content: '# README',
      noteType: 'project',
      contentType: 'markdown',
      filePath: '/tmp/dao-test/personal-workspace-1/dao-project/README.md',
      createdAt: '2026-05-25T00:00:00Z',
      updatedAt: '2026-05-25T00:00:00Z',
      deletedAt: null,
      version: 1,
      syncStatus: 'synced',
    },
  ]);
}
```

Add this test:

```jsx
it('opens project and note tabs with resource titles and dedupes them', async () => {
  const user = userEvent.setup();

  renderApp();

  await user.click(await screen.findByRole('button', { name: 'Dao Project' }));

  expect(screen.getByRole('tab', { name: /Dao Project/ })).toHaveAttribute('aria-selected', 'true');

  await user.click(screen.getByRole('button', { name: 'README' }));

  expect(screen.getByRole('tab', { name: /README/ })).toHaveAttribute('aria-selected', 'true');

  await user.click(screen.getByRole('button', { name: 'Dao Project' }));
  await user.click(screen.getByRole('button', { name: 'README' }));

  expect(screen.getAllByRole('tab', { name: /Dao Project/ })).toHaveLength(1);
  expect(screen.getAllByRole('tab', { name: /README/ })).toHaveLength(1);
});
```

- [ ] **Step 2: Run App tests and verify resource failure**

Run:

```bash
cd apps/web
npm test -- App
```

Expected: FAIL until project/note selection callbacks pass title metadata.

- [ ] **Step 3: Update ProjectTree callback signatures**

In `apps/web/src/components/app/ProjectTree.jsx`, find project button press handlers and change project selection from:

```jsx
onPress={() => onSelectProject(project.id)}
```

to:

```jsx
onPress={() => onSelectProject(project)}
```

Find note button press handlers and change note selection from:

```jsx
onPress={() => onSelectNote(note.id)}
```

to:

```jsx
onPress={() => onSelectNote(note)}
```

Do not change the visual ProjectTree layout in this task.

- [ ] **Step 4: Update AppSidebar passthrough names only if needed**

If `AppSidebar.jsx` uses callback parameter names that imply ids, update only the names for clarity:

```jsx
onSelectProject={onSelectProject}
onSelectNote={onSelectNote}
```

No behavior change should be needed in `AppSidebar.jsx` because it passes callbacks through.

- [ ] **Step 5: Update App project/note handlers to accept resources**

In `apps/web/src/App.jsx`, replace `handleSelectProject` with:

```js
function handleSelectProject(project) {
  openTab(createProjectTab(project));
}
```

Replace `handleSelectNote` with:

```js
function handleSelectNote(note) {
  openTab(createNoteTab(note));
}
```

- [ ] **Step 6: Run App tests and verify pass**

Run:

```bash
cd apps/web
npm test -- App
```

Expected: PASS.

- [ ] **Step 7: Run ProjectTree tests for callback compatibility**

Run:

```bash
cd apps/web
npm test -- ProjectTree
```

Expected: Existing tests may fail if they expect callback ids. Update expectations to resource objects only where callbacks changed.

Example expected update:

```js
expect(onSelectProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'project-1' }));
expect(onSelectNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'note-1' }));
```

- [ ] **Step 8: Commit resource tab titles**

Run:

```bash
git add apps/web/src/App.jsx apps/web/src/App.test.jsx apps/web/src/components/app/ProjectTree.jsx apps/web/src/components/app/ProjectTree*.test.*
git commit -m "feat: open resource tabs from project tree"
```

## Task 5: Final Layout Polish and Full Validation

**Files:**
- Modify if needed: `apps/web/src/App.jsx`
- Modify if needed: `apps/web/src/components/app/AppTabBar.jsx`
- Modify if needed: `apps/web/src/features/tasks/components/TaskPanel.jsx`

- [ ] **Step 1: Check for duplicate page headings**

Run:

```bash
cd apps/web/src
grep -R "<h1\|font-heading text-xl\|font-heading text-lg" -n App.jsx features components/app | head -80
```

Expected: No generic main header remains in `App.jsx`. Project resource metadata and note title input may remain.

- [ ] **Step 2: Remove duplicate generic Tasks heading only if present**

If `TaskPanel.jsx` contains a top-level visible heading that duplicates the active tab title, remove only that generic heading. Do not remove form labels, table labels, or accessibility names such as `aria-label="Tasks"`.

Expected: The task table should still expose `role="grid"` with name `Tasks` for tests and assistive tech.

- [ ] **Step 3: Run focused tests**

Run:

```bash
cd apps/web
npm test -- app-tabs AppTabBar App ProjectTree TaskPanel
```

Expected: PASS. If TaskPanel interaction tests are flaky with existing timeouts, document that they are pre-existing and rerun the focused non-interaction tests:

```bash
npm test -- app-tabs AppTabBar App ProjectTree.test.js TaskPanel.test.js
```

- [ ] **Step 4: Run build**

Run:

```bash
cd apps/web
npm run build
```

Expected: PASS. Existing Vite chunk-size warning is acceptable.

- [ ] **Step 5: Inspect git status and avoid pi-lens**

Run:

```bash
git status --short
```

Expected modified/created files are limited to planned files. Do not add `apps/web/.pi-lens/`.

- [ ] **Step 6: Commit final polish if changes were needed**

If Step 1 or Step 2 changed files, run:

```bash
git add apps/web/src/App.jsx apps/web/src/components/app/AppTabBar.jsx apps/web/src/features/tasks/components/TaskPanel.jsx
git commit -m "style: polish workspace tab layout"
```

If no files changed, skip this commit.

## Self-Review

- Spec coverage: The plan covers empty startup, non-persistence, tab dedupe by resource, close active to left neighbor, close final to empty state, App-level tab state, AppTabBar presentation, page heading replacement, and focused tests.
- Placeholder scan: No `TBD`, `TODO`, or incomplete implementation steps remain. Task 3 uses explicit compatibility code for the current id-based ProjectTree callbacks, and Task 4 replaces that code with resource-object callbacks.
- Type consistency: Tab descriptors consistently use `id`, `title`, `surfaceId`, `resourceType`, and `resourceId`. Callback flow changes from ids to resource objects are isolated to Task 4.
