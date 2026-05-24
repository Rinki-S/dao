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
  SidebarRail,
} from '@/components/ui/sidebar';
import { resolveSidebarIcon } from '@/extensions/sidebar-icons.js';

export function AppSidebar({ activeSurfaceId, sidebarItems, onSelectSurface }) {
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

      <SidebarRail />
    </Sidebar>
  );
}
