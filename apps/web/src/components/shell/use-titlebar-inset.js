import { useContext } from 'react';
import { SidebarContext } from '@/components/ui/sidebar.jsx';
import { cn } from '@/lib/utils';

/**
 * Classes for the top bar of a workspace surface. While the sidebar is hidden
 * the bar has to keep its leading edge clear of the macOS traffic lights and
 * the window trigger. The reserved space is animated so the bar's contents
 * travel with the sidebar instead of snapping to a new position.
 *
 * Reads the sidebar context directly instead of `useSidebar` so a top bar stays
 * renderable outside the shell (unit tests mount the editor on its own).
 *
 * - `padding` for a bar whose content is left-aligned.
 * - `rail` for a leading spacer in a bar with a centred element: paired with an
 *   equally flexible trailing rail it centres that element in the whole bar,
 *   and only clamps once the bar gets too narrow for the window controls.
 */
export function useTitlebarInset() {
  const sidebar = useContext(SidebarContext);
  const collapsed = sidebar?.state === 'collapsed';

  return {
    padding: cn('transition-[padding-inline-start] duration-200 ease-shell', collapsed && 'ps-30'),
    rail: cn(
      'min-w-0 flex-1 transition-[min-width] duration-200 ease-shell',
      collapsed && 'min-w-30',
    ),
    /**
     * Offset for a drag surface inside the leading rail: it has to start after
     * the window controls, because an app-region ancestor swallows clicks for
     * the trigger overlapping it.
     */
    controlsOffset: cn(
      'transition-[margin-inline-start] duration-200 ease-shell',
      collapsed && 'ms-26',
    ),
  };
}
