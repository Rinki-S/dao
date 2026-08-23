import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar.jsx';

/**
 * The one and only sidebar trigger. It lives outside both the sidebar and the
 * workspace surface so that collapsing does not unmount and remount it: the
 * same element travels between the sidebar's trailing edge and the traffic
 * lights, on the same curve as the sidebar itself.
 *
 * The fixed wrapper carries the drag region and the travel, so the button
 * itself stays a plain in-flow child — an absolutely positioned button does not
 * reliably carve its `no-drag` rect out of the top bar underneath it.
 *
 * While the hidden sidebar is peeked open the trigger rides along to its
 * trailing edge, so the peek reads as the sidebar itself rather than as a panel
 * sliding out from under a button that stayed behind.
 */
export function WindowSidebarTrigger({ peeking = false, onPeekChange }) {
  const { state } = useSidebar();
  const atSidebarEdge = state === 'expanded' || peeking;

  return (
    <div
      className="app-drag-region fixed top-2 z-30 size-8 transition-[inset-inline-start] duration-200 ease-shell"
      style={{
        insetInlineStart: atSidebarEdge ? 'calc(var(--sidebar-width) - 2.5rem)' : '5rem',
      }}
    >
      {/* The glyph fills 16/24 of its viewBox, so an 18px icon draws exactly
          12px tall — flush with the 12px macOS traffic lights beside it. */}
      <SidebarTrigger
        aria-label="Toggle sidebar"
        className="[&_svg]:size-4.5!"
        onClick={() => onPeekChange?.(false)}
      />
    </div>
  );
}
