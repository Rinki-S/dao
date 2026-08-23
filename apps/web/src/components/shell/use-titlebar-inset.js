import { createContext, useContext } from 'react';
import { SidebarContext } from '@/components/ui/sidebar.jsx';
import { cn } from '@/lib/utils';

/**
 * Whether the hidden sidebar is currently peeked open. The shell owns the
 * state; the top bars need it because the peek changes where the window
 * trigger sits, and a drag region under the trigger swallows its clicks.
 */
export const TitlebarPeekContext = createContext(false);

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
 * - `drag` for any drag surface in the bar, and `controlsOffset` for one that
 *   sits in the leading rail.
 */
export function useTitlebarInset() {
  const sidebar = useContext(SidebarContext);
  const peeking = useContext(TitlebarPeekContext);
  const collapsed = sidebar?.state === 'collapsed';

  return {
    padding: cn('transition-[padding-inline-start] duration-200 ease-shell', collapsed && 'ps-30'),
    rail: cn(
      'min-w-0 flex-1 transition-[min-width] duration-200 ease-shell',
      collapsed && 'min-w-30',
    ),
    /**
     * A drag surface has to leave the window trigger alone: an app-region
     * element swallows clicks for anything overlapping it that is not its own
     * descendant, and the trigger is fixed, outside every bar. While the
     * sidebar is peeked the trigger travels to the sidebar's trailing edge,
     * over this chrome — which the peek covers anyway, so the whole bar stops
     * being draggable rather than trying to dodge the trigger's new position.
     */
    drag: collapsed && peeking ? '' : 'app-drag-region',
    /** Offset that keeps a leading-rail drag surface clear of the trigger. */
    controlsOffset: cn(
      'transition-[margin-inline-start] duration-200 ease-shell',
      collapsed && 'ms-26',
    ),
  };
}
