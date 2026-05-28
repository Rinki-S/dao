import { HugeiconsIcon } from '@hugeicons/react';
import Layers01Icon from '@hugeicons/core-free-icons/Layers01Icon';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
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
    <Sidebar
      collapsible="icon"
      className="top-12 h-[calc(100dvh-3rem)] [&_[data-sidebar=sidebar]]:bg-background"
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <WorkspaceSwitcher
              workspaces={workspaces}
              currentWorkspace={currentWorkspace}
              isLoading={isWorkspaceLoading}
              error={workspaceError}
              menuOpen={workspaceMenuOpen}
              onMenuOpenChange={onWorkspaceMenuOpenChange}
              createDialogOpen={createWorkspaceDialogOpen}
              onCreateDialogOpenChange={onCreateWorkspaceDialogOpenChange}
              onSelectWorkspace={onSelectWorkspace}
              onCreateWorkspace={onCreateWorkspace}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sidebarItems.map((item) => {
                const surfaceId = item.href.replace(/^#/, '');
                const Icon = item.icon ?? ExtensionIcon;

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={surfaceId === activeSurfaceId}
                      tooltip={item.label}
                    >
                      <a
                        className="app-no-drag"
                        href={item.href}
                        onClick={(event) => {
                          event.preventDefault();
                          onSelectSurface(surfaceId);
                        }}
                      >
                        <Icon aria-hidden="true" className="size-4 shrink-0" />
                        <span>{item.label}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <ProjectTree
          currentWorkspace={currentWorkspace}
          selectedProjectId={selectedProjectId}
          selectedNoteId={selectedNoteId}
          onSelectProject={onSelectProject}
          onSelectNote={onSelectNote}
        />
      </SidebarContent>

      {footerSidebarItems.length > 0 && (
        <SidebarFooter>
          <SidebarMenu>
            {footerSidebarItems.map((item) => {
              const surfaceId = item.href.replace(/^#/, '');
              const Icon = item.icon ?? ExtensionIcon;

              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={surfaceId === activeSurfaceId}
                    className="w-8 justify-center"
                    tooltip={item.label}
                  >
                    <a
                      className="app-no-drag"
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
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarFooter>
      )}

      <div
        aria-label="Resize sidebar"
        className="app-no-drag absolute top-0 right-0 z-30 hidden h-full w-2 translate-x-1/2 cursor-col-resize bg-transparent hover:bg-border md:block"
        role="separator"
        tabIndex={0}
        onPointerDown={handleResizePointerDown}
      />
    </Sidebar>
  );
}
