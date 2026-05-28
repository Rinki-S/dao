import { useEffect, useMemo, useState } from 'react';
import { AppSidebar } from '@/components/app/AppSidebar.jsx';
import { AppTitleBar } from '@/components/app/AppTitleBar.jsx';
import { ProjectContentsPanel } from '@/components/app/ProjectContentsPanel.jsx';
import { WorkingDirectoryOnboarding } from '@/components/app/WorkingDirectoryOnboarding.jsx';
import { NoteEditorPanel } from '@/features/notes/components/NoteEditorPanel.jsx';
import { getSurfaceComponent } from './app-surfaces.jsx';
import { CommandPalette } from './features/command-palette/components/CommandPalette.jsx';
import { getRegisteredSidebarItems, getRegisteredSurfaces } from './extensions/registry.js';
import { notifyActivityChanged } from './features/activities/events.js';
import { getWorkingDirectory, updateWorkingDirectory } from './features/settings/api.js';
import { createWorkspace, listWorkspaces } from './features/workspaces/api.js';

const SIDEBAR_DEFAULT_WIDTH = 256;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 340;
const SIDEBAR_COLLAPSE_THRESHOLD = 160;

function getSurfaceIdFromHash(surfaces) {
  const hashSurfaceId = window.location.hash.replace(/^#/, '');

  if (surfaces.some((surface) => surface.id === hashSurfaceId)) {
    return hashSurfaceId;
  }

  return surfaces.find((surface) => surface.id === 'tasks')?.id ?? surfaces[0]?.id ?? '';
}

function App() {
  const registeredSidebarItems = getRegisteredSidebarItems();
  const sidebarItems = registeredSidebarItems.filter((item) => item.id === 'tasks');
  const footerSidebarItems = registeredSidebarItems.filter((item) => item.id === 'settings');
  const surfaces = getRegisteredSurfaces();
  const [activeSurfaceId, setActiveSurfaceId] = useState(() => getSurfaceIdFromHash(surfaces));
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState('');
  const [workspaceStatus, setWorkspaceStatus] = useState('loading');
  const [workspaceError, setWorkspaceError] = useState('');
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isCreateWorkspaceDialogOpen, setIsCreateWorkspaceDialogOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [workingDirectoryStatus, setWorkingDirectoryStatus] = useState('loading');
  const [workingDirectoryError, setWorkingDirectoryError] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState(null);
  const [isReplayingOnboarding, setIsReplayingOnboarding] = useState(false);
  const activeSurface = useMemo(
    () => surfaces.find((surface) => surface.id === activeSurfaceId) ?? null,
    [activeSurfaceId, surfaces],
  );
  const currentWorkspace = useMemo(() => {
    return workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? null;
  }, [workspaces, currentWorkspaceId]);

  useEffect(() => {
    function handleHashChange() {
      setActiveSurfaceId(getSurfaceIdFromHash(surfaces));
    }

    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [surfaces]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setWorkingDirectoryStatus('loading');
        setWorkingDirectoryError('');

        const nextWorkingDirectory = await getWorkingDirectory();

        if (cancelled) {
          return;
        }

        setWorkingDirectory(nextWorkingDirectory);

        if (!nextWorkingDirectory.configured) {
          setWorkingDirectoryStatus('unconfigured');
          setWorkspaceStatus('idle');
          return;
        }

        setWorkingDirectoryStatus('ready');
        setWorkspaceStatus('loading');
        setWorkspaceError('');

        const nextWorkspaces = await listWorkspaces();

        if (cancelled) {
          return;
        }

        setWorkspaces(nextWorkspaces);
        setCurrentWorkspaceId((currentId) => {
          if (nextWorkspaces.some((workspace) => workspace.id === currentId)) {
            return currentId;
          }

          return nextWorkspaces[0]?.id ?? '';
        });
        setWorkspaceStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setWorkingDirectoryError(
            err instanceof Error ? err.message : 'Failed to load working directory',
          );
          setWorkingDirectoryStatus('error');
          setWorkspaceStatus('error');
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleWorkingDirectoryComplete({ path, workspace }) {
    const nextWorkingDirectory = await updateWorkingDirectory({ path });
    const createdWorkspace = workspace ? await createWorkspace(workspace) : null;
    const nextWorkspaces = await listWorkspaces();

    setWorkingDirectory(nextWorkingDirectory);
    setWorkingDirectoryStatus('ready');
    setWorkingDirectoryError('');
    setWorkspaces(nextWorkspaces);
    setCurrentWorkspaceId((currentId) => {
      if (createdWorkspace) {
        return createdWorkspace.id;
      }

      if (nextWorkspaces.some((nextWorkspace) => nextWorkspace.id === currentId)) {
        return currentId;
      }

      return nextWorkspaces[0]?.id ?? '';
    });
    setWorkspaceStatus('ready');
    setWorkspaceError('');

    if (createdWorkspace) {
      notifyActivityChanged();
    }
  }

  function handleSelectSurface(surfaceId) {
    if (!surfaces.some((surface) => surface.id === surfaceId)) {
      return;
    }

    setSelectedProjectId('');
    setSelectedNoteId('');
    setActiveSurfaceId(surfaceId);
    window.history.replaceState(null, '', `#${surfaceId}`);
  }

  function handleSelectProject(projectId) {
    setSelectedProjectId(projectId);
    setSelectedNoteId('');
    setActiveSurfaceId('project-contents');
    window.history.replaceState(null, '', '#project-contents');
  }

  function handleSelectNote(noteId) {
    setSelectedNoteId(noteId);
    setSelectedProjectId('');
    setActiveSurfaceId('note-editor');
    window.history.replaceState(null, '', '#note-editor');
  }

  function handleSidebarOpenChange(nextIsSidebarOpen) {
    setIsSidebarOpen(nextIsSidebarOpen);

    if (nextIsSidebarOpen) {
      setSidebarWidth((currentWidth) => Math.max(currentWidth, SIDEBAR_DEFAULT_WIDTH));
    }
  }

  function handleResizeSidebar(nextSidebarWidth) {
    if (nextSidebarWidth < SIDEBAR_COLLAPSE_THRESHOLD) {
      setIsSidebarOpen(false);
      return;
    }

    setIsSidebarOpen(true);
    setSidebarWidth(Math.min(Math.max(nextSidebarWidth, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH));
  }

  function handleCommandAction(action) {
    if (action === 'create-workspace') {
      setIsWorkspaceMenuOpen(false);
      setIsCreateWorkspaceDialogOpen(true);
      return;
    }

    if (action === 'switch-workspace') {
      setIsCreateWorkspaceDialogOpen(false);
      setIsSidebarOpen(true);
      setIsWorkspaceMenuOpen(true);
      return;
    }

    if (action === 'focus-search') {
      window.setTimeout(() => {
        document.querySelector('[data-command-target="search-query"]')?.focus();
      }, 0);
    }
  }

  async function handleCreateWorkspace(input) {
    const createdWorkspace = await createWorkspace(input);
    const nextWorkspaces = await listWorkspaces();

    setWorkspaces(nextWorkspaces);
    setCurrentWorkspaceId(createdWorkspace.id);
    setWorkspaceStatus('ready');
    setWorkspaceError('');
    notifyActivityChanged();

    return createdWorkspace;
  }

  if (workingDirectoryStatus === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Loading Dao...
      </div>
    );
  }

  if (workingDirectoryStatus === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-sm text-destructive">
        {workingDirectoryError}
      </div>
    );
  }

  if (workingDirectoryStatus === 'unconfigured' || !workingDirectory?.configured) {
    return <WorkingDirectoryOnboarding onComplete={handleWorkingDirectoryComplete} />;
  }

  if (isReplayingOnboarding) {
    return (
      <WorkingDirectoryOnboarding
        hasWorkspace={workspaces.length > 0}
        initialPath={workingDirectory?.path ?? ''}
        mode="replay"
        onCancel={() => setIsReplayingOnboarding(false)}
        onComplete={async (input) => {
          await handleWorkingDirectoryComplete(input);
          setIsReplayingOnboarding(false);
        }}
      />
    );
  }

  return (
    <div
      className="h-dvh min-h-0 overflow-hidden"
      data-sidebar-state={isSidebarOpen ? 'expanded' : 'collapsed'}
      data-slot="sidebar-wrapper"
      style={{
        '--sidebar-width': `${sidebarWidth}px`,
        '--sidebar-width-icon': '3rem',
      }}
    >
      <CommandPalette onSelectSurface={handleSelectSurface} onRunAction={handleCommandAction} />
      <div className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
        <AppTitleBar
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => handleSidebarOpenChange(!isSidebarOpen)}
        />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <AppSidebar
            activeSurfaceId={activeSurface?.id}
            sidebarItems={sidebarItems}
            footerSidebarItems={footerSidebarItems}
            workspaces={workspaces}
            currentWorkspace={currentWorkspace}
            selectedProjectId={selectedProjectId}
            selectedNoteId={selectedNoteId}
            isWorkspaceLoading={workspaceStatus === 'loading'}
            workspaceError={workspaceError}
            workspaceMenuOpen={isWorkspaceMenuOpen}
            createWorkspaceDialogOpen={isCreateWorkspaceDialogOpen}
            onSelectSurface={handleSelectSurface}
            onSelectProject={handleSelectProject}
            onSelectNote={handleSelectNote}
            onSelectWorkspace={setCurrentWorkspaceId}
            onWorkspaceMenuOpenChange={setIsWorkspaceMenuOpen}
            onCreateWorkspaceDialogOpenChange={setIsCreateWorkspaceDialogOpen}
            onCreateWorkspace={handleCreateWorkspace}
            onResizeSidebar={handleResizeSidebar}
            isSidebarOpen={isSidebarOpen}
            resizeMinWidth={SIDEBAR_MIN_WIDTH}
            resizeMaxWidth={SIDEBAR_MAX_WIDTH}
            resizeCollapseThreshold={SIDEBAR_COLLAPSE_THRESHOLD}
          />
          <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-sidebar">
            <header className="flex h-14 shrink-0 items-center border-b border-border px-8">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-heading font-semibold tracking-normal text-foreground">
                  {activeSurfaceId === 'project-contents'
                    ? 'Project'
                    : activeSurfaceId === 'note-editor'
                      ? 'Note'
                      : (activeSurface?.label ?? 'Dao')}
                </h1>
              </div>
            </header>

            <section
              className={
                activeSurfaceId === 'tasks'
                  ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                  : 'flex min-h-0 flex-1 flex-col overflow-hidden px-8 py-7'
              }
            >
              {activeSurfaceId === 'project-contents' ? (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <ProjectContentsPanel
                    currentWorkspace={currentWorkspace}
                    selectedProjectId={selectedProjectId}
                  />
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
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
