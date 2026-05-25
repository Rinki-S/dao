import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { resolveSidebarIcon } from '@/extensions/sidebar-icons.js';

export function AppSidebar({
  activeSurfaceId,
  sidebarItems,
  onSelectSurface,
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
      className="top-12 h-[calc(100svh-3rem)] [&_[data-sidebar=sidebar]]:bg-background"
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Dao" className="app-no-drag font-heading">
              <span className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                d
              </span>
              <span className="truncate text-sm font-semibold tracking-normal">
                dao<span className="text-primary">.</span>
              </span>
            </SidebarMenuButton>
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
                const Icon = resolveSidebarIcon(item.icon);

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
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

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
