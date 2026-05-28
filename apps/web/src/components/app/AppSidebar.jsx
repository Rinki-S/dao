import { Tooltip } from '@heroui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import Layers01Icon from '@hugeicons/core-free-icons/Layers01Icon';
import { cn } from '@/lib/utils.js';
import { ProjectTree } from './ProjectTree.jsx';
import { WorkspaceSwitcher } from './WorkspaceSwitcher.jsx';

function ExtensionIcon(props) {
  return <HugeiconsIcon icon={Layers01Icon} {...props} />;
}

export function AppSidebar({
  activeSurfaceId,
  sidebarItems,
  footerSidebarItems,
  workspaces,
  currentWorkspace,
  selectedProjectId,
  selectedNoteId,
  isWorkspaceLoading,
  workspaceError,
  workspaceMenuOpen,
  createWorkspaceDialogOpen,
  onSelectSurface,
  onSelectProject,
  onSelectNote,
  onSelectWorkspace,
  onWorkspaceMenuOpenChange,
  onCreateWorkspaceDialogOpenChange,
  onCreateWorkspace,
  onResizeSidebar,
  isSidebarOpen,
  resizeMinWidth,
  resizeMaxWidth,
  resizeCollapseThreshold,
}) {
  function handleResizePointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    const sidebarWrapper = event.currentTarget.closest('[data-slot="sidebar-wrapper"]');

    if (!sidebarWrapper) {
      return;
    }

    let latestClientX = event.clientX;
    let isCollapsedDuringResize = !isSidebarOpen;

    sidebarWrapper.classList.add('app-sidebar-resizing');

    function stopResize() {
      sidebarWrapper.classList.remove('app-sidebar-resizing');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    }

    function handlePointerMove(moveEvent) {
      latestClientX = moveEvent.clientX;

      if (moveEvent.clientX < resizeCollapseThreshold) {
        if (!isCollapsedDuringResize) {
          isCollapsedDuringResize = true;
          onResizeSidebar(moveEvent.clientX);
        }

        return;
      }

      const nextSidebarWidth = Math.min(
        Math.max(moveEvent.clientX, resizeMinWidth),
        resizeMaxWidth,
      );

      sidebarWrapper.style.setProperty('--sidebar-width', `${nextSidebarWidth}px`);

      if (isCollapsedDuringResize) {
        isCollapsedDuringResize = false;
        onResizeSidebar(nextSidebarWidth);
      }
    }

    function handlePointerUp() {
      stopResize();

      onResizeSidebar(latestClientX);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  }

  return (
    <aside
      className={cn(
        'relative hidden h-[calc(100dvh-3rem)] shrink-0 flex-col border-r border-border bg-background text-sidebar-foreground transition-[width] duration-200 ease-linear md:flex',
        isSidebarOpen ? 'w-(--sidebar-width)' : 'w-(--sidebar-width-icon)',
      )}
      data-collapsible={isSidebarOpen ? '' : 'icon'}
      data-sidebar-state={isSidebarOpen ? 'expanded' : 'collapsed'}
      data-slot="app-sidebar"
    >
      <div className="flex flex-col gap-2 p-2">
        <ul className="flex min-w-0 flex-col gap-0">
          <li className="relative">
            <WorkspaceSwitcher
              workspaces={workspaces}
              currentWorkspace={currentWorkspace}
              isLoading={isWorkspaceLoading}
              error={workspaceError}
              menuOpen={workspaceMenuOpen}
              isSidebarOpen={isSidebarOpen}
              onMenuOpenChange={onWorkspaceMenuOpenChange}
              createDialogOpen={createWorkspaceDialogOpen}
              onCreateDialogOpenChange={onCreateWorkspaceDialogOpenChange}
              onSelectWorkspace={onSelectWorkspace}
              onCreateWorkspace={onCreateWorkspace}
            />
          </li>
        </ul>
      </div>

      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto data-[collapsed=true]:overflow-hidden">
        <section className="relative flex w-full min-w-0 flex-col p-2">
          <div
            className={cn(
              'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 transition-[margin,opacity] duration-200 ease-linear',
              !isSidebarOpen && '-mt-8 opacity-0',
            )}
          >
            Workspace
          </div>

          <div className="w-full text-sm">
            <ul className="flex w-full min-w-0 flex-col gap-0">
              {sidebarItems.map((item) => {
                const surfaceId = item.href.replace(/^#/, '');
                const Icon = item.icon ?? ExtensionIcon;
                const isActive = surfaceId === activeSurfaceId;
                const link = (
                  <a
                    className={cn(
                      'app-no-drag flex h-8 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[background-color,color,width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2',
                      !isSidebarOpen && 'size-8 justify-center p-2',
                      isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                    )}
                    href={item.href}
                    onClick={(event) => {
                      event.preventDefault();
                      onSelectSurface(surfaceId);
                    }}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    <span className={cn('truncate', !isSidebarOpen && 'sr-only')}>
                      {item.label}
                    </span>
                  </a>
                );

                return (
                  <li key={item.id} className="relative">
                    {isSidebarOpen ? (
                      link
                    ) : (
                      <Tooltip delay={0}>
                        {link}
                        <Tooltip.Content placement="right">{item.label}</Tooltip.Content>
                      </Tooltip>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <ProjectTree
          currentWorkspace={currentWorkspace}
          selectedProjectId={selectedProjectId}
          selectedNoteId={selectedNoteId}
          isSidebarOpen={isSidebarOpen}
          onSelectProject={onSelectProject}
          onSelectNote={onSelectNote}
        />
      </div>

      {footerSidebarItems.length > 0 && (
        <div className="flex flex-col gap-2 p-2">
          <ul className="flex min-w-0 flex-col gap-0">
            {footerSidebarItems.map((item) => {
              const surfaceId = item.href.replace(/^#/, '');
              const Icon = item.icon ?? ExtensionIcon;
              const isActive = surfaceId === activeSurfaceId;
              const link = (
                <a
                  className={cn(
                    'app-no-drag flex size-8 items-center justify-center overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[background-color,color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2',
                    isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                  )}
                  href={item.href}
                  aria-label={item.label}
                  onClick={(event) => {
                    event.preventDefault();
                    onSelectSurface(surfaceId);
                  }}
                >
                  <Icon aria-hidden="true" className="size-[18px] shrink-0 translate-y-px" />
                  <span className="sr-only">{item.label}</span>
                </a>
              );

              return (
                <li key={item.id} className="relative">
                  <Tooltip delay={0}>
                    {link}
                    <Tooltip.Content placement="right">{item.label}</Tooltip.Content>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div
        aria-label="Resize sidebar"
        className="app-no-drag absolute top-0 right-0 z-30 hidden h-full w-2 translate-x-1/2 cursor-col-resize bg-transparent hover:bg-border md:block"
        role="separator"
        tabIndex={0}
        onPointerDown={handleResizePointerDown}
      />
    </aside>
  );
}
