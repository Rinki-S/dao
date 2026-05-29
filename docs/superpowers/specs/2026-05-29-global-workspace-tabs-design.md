# Global Workspace Tabs Design

## Status

Approved for implementation planning.

## Goal

Replace page-level heading areas with a global workspace tab bar. The tab bar should behave like browser or IDE tabs: users can open pages/resources, switch between open tabs, and close tabs. Tabs are a frontend runtime navigation state only.

## Non-goals

- Persist tabs across app restarts.
- Store tab state in SQLite or the Go local service.
- Add tab drag sorting.
- Add pinned tabs.
- Add split view.
- Add tab context menus.
- Add browser-like back/forward history.
- Change the extension marketplace or AI scope.

## Navigation Model

`App.jsx` owns the tab state:

```js
openTabs = [
  {
    id: 'tasks',
    title: 'Tasks',
    surfaceId: 'tasks',
    resourceType: 'surface',
    resourceId: null,
  },
  {
    id: 'project:abc',
    title: 'Dao Project',
    surfaceId: 'project-contents',
    resourceType: 'project',
    resourceId: 'abc',
  },
  {
    id: 'note:def',
    title: 'README',
    surfaceId: 'note-editor',
    resourceType: 'note',
    resourceId: 'def',
  },
];
```

Tab identity is resource-specific:

- Plain surfaces use the surface id, such as `tasks` or `settings`.
- Projects use `project:<projectId>`.
- Notes use `note:<noteId>`.

Selecting a page or resource opens a new tab only when no matching tab exists. If a matching tab already exists, Dao activates the existing tab.

## Startup and Empty State

Dao starts with no tabs open:

```js
openTabs = [];
activeTabId = '';
```

When no tab is active, the main content area shows a calm empty state instead of opening Tasks automatically. Closing the final tab returns to the same empty state.

The empty state should explain that no page is open and prompt the user to open something from the sidebar or command palette. It may include a low-emphasis action to open Tasks, but opening Tasks must be user-initiated.

## Tab Actions

| Action | Behavior |
| --- | --- |
| Click sidebar surface | Open or activate that surface tab. |
| Click project | Open or activate `project:<projectId>` and restore `selectedProjectId`. |
| Click note | Open or activate `note:<noteId>` and restore `selectedNoteId`. |
| Click tab | Activate that tab and restore its associated surface/resource state. |
| Close inactive tab | Remove it without changing the active tab. |
| Close active tab | Activate the left adjacent tab. If none exists, activate the right adjacent tab. If no tabs remain, clear `activeTabId`. |
| Close final tab | Show the empty state. |
| Restart app | Start empty again; do not restore tabs. |

## UI Placement

The tab bar sits below the titlebar and above the active content area. It replaces page-level heading sections such as a top-level `Tasks` heading.

```txt
Titlebar
Tab bar: [ Tasks ] [ Note A ] [ Project B ]
Content for active tab
```

The tab bar should be visually quieter than the titlebar:

- Approximate height: 40px.
- Active tab: stronger text, subtle surface/background distinction, restrained border.
- Inactive tab: muted text with low-noise hover state.
- Close button: small, available on every tab.
- Overflow: horizontal scrolling for the first version.
- Empty state in tab bar: optional muted `No tab open` text when the tab list is empty.

Use HeroUI primitives and existing Dao tokens. The tab bar should feel calm, precise, and developer-native.

## Component Structure

Add a focused component:

```txt
apps/web/src/components/app/AppTabBar.jsx
```

Responsibilities:

| Unit | Responsibility |
| --- | --- |
| `App.jsx` | Own `openTabs`, `activeTabId`, and tab navigation logic. |
| `AppTabBar.jsx` | Render tabs, active state, close buttons, and tab click events. |
| Empty state component or inline view | Render the no-tab main content state. |
| Existing panels | Continue to own business UI and data loading. |

`AppTabBar.jsx` should be presentational. It receives tabs and callbacks from `App.jsx`:

```js
<AppTabBar
  tabs={openTabs}
  activeTabId={activeTabId}
  onSelectTab={handleSelectTab}
  onCloseTab={handleCloseTab}
/>
```

## Rendering and State Restoration

Activating a tab restores the existing app state needed to render that tab:

| Tab type | Restored app state |
| --- | --- |
| `surface` | `activeSurfaceId = tab.surfaceId`; clear resource selections only where appropriate. |
| `project` | `activeSurfaceId = 'project-contents'`; `selectedProjectId = tab.resourceId`. |
| `note` | `activeSurfaceId = 'note-editor'`; `selectedNoteId = tab.resourceId`. |

The active content renderer should show the empty state when `activeTabId` is empty or no active tab can be resolved.

## Page Heading Strategy

| Page | First-version handling |
| --- | --- |
| Tasks | Remove or avoid a duplicate top-level `Tasks` heading; the active tab provides the page title. |
| Settings | Do not add a duplicate Settings heading; the active tab provides the page title. |
| Project contents | Keep the project name area because it is resource metadata, not only a generic page heading. |
| Note editor | Keep the note title input because it edits note data, not just page navigation. |

## Testing Plan

Add focused tests for:

- `AppTabBar` renders active and inactive tabs.
- Clicking a tab activates it.
- Closing an inactive tab does not change the active tab.
- Closing the active tab selects the left neighbor.
- Closing the first active tab selects the right neighbor.
- Closing the final tab shows the empty state.
- Selecting the same surface/project/note reuses the existing tab instead of duplicating it.

## Implementation Boundaries

- Frontend only.
- No Go service changes.
- No SQLite migration.
- No persistence.
- No new routing library.
- Keep extension behavior simple: unknown extension surfaces can be treated as plain surface tabs keyed by `surfaceId`.
