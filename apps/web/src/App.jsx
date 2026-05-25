import { useEffect, useMemo, useState } from 'react';
import { AppSidebar } from '@/components/app/AppSidebar.jsx';
import { AppTitleBar } from '@/components/app/AppTitleBar.jsx';
import { ProjectContentsPanel } from '@/components/app/ProjectContentsPanel.jsx';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { getSurfaceComponent } from './app-surfaces.jsx';
import { CommandPalette } from './features/command-palette/components/CommandPalette.jsx';
import { getRegisteredSidebarItems, getRegisteredSurfaces } from './extensions/registry.js';
import { notifyActivityChanged } from './features/activities/events.js';
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
          setWorkspaceError(err instanceof Error ? err.message : 'Failed to load workspaces');
          setWorkspaceStatus('error');
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleSelectSurface(surfaceId) {
    if (!surfaces.some((surface) => surface.id === surfaceId)) {
      return;
    }

    setSelectedProjectId('');
    setActiveSurfaceId(surfaceId);
    window.history.replaceState(null, '', `#${surfaceId}`);
  }

  function handleSelectProject(projectId) {
    setSelectedProjectId(projectId);
    setActiveSurfaceId('project-contents');
    window.history.replaceState(null, '', '#project-contents');
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

  return (
    <SidebarProvider
      className="min-h-0 flex-1"
      open={isSidebarOpen}
      onOpenChange={handleSidebarOpenChange}
      style={{
        '--sidebar-width': `${sidebarWidth}px`,
      }}
    >
      <CommandPalette onSelectSurface={handleSelectSurface} onRunAction={handleCommandAction} />
      <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
        <AppTitleBar />
        <div className="flex min-h-0 flex-1">
          <AppSidebar
            activeSurfaceId={activeSurface?.id}
            sidebarItems={sidebarItems}
            footerSidebarItems={footerSidebarItems}
            workspaces={workspaces}
            currentWorkspace={currentWorkspace}
            selectedProjectId={selectedProjectId}
            isWorkspaceLoading={workspaceStatus === 'loading'}
            workspaceError={workspaceError}
            workspaceMenuOpen={isWorkspaceMenuOpen}
            createWorkspaceDialogOpen={isCreateWorkspaceDialogOpen}
            onSelectSurface={handleSelectSurface}
            onSelectProject={handleSelectProject}
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
          <SidebarInset className="min-h-0 bg-sidebar">
            <header className="flex h-14 shrink-0 items-center border-b border-border px-8">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-heading font-semibold tracking-normal text-foreground">
                  {activeSurfaceId === 'project-contents'
                    ? 'Project'
                    : (activeSurface?.label ?? 'Dao')}
                </h1>
              </div>
            </header>

            <section className="flex-1 px-8 py-7">
              {activeSurfaceId === 'project-contents' ? (
                <ProjectContentsPanel
                  currentWorkspace={currentWorkspace}
                  selectedProjectId={selectedProjectId}
                />
              ) : activeSurface ? (
                getSurfaceComponent(activeSurface.id, { currentWorkspace })
              ) : null}
            </section>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default App;
