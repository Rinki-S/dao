import { useEffect, useMemo, useState } from 'react';
import { AppSidebar } from '@/components/app/AppSidebar.jsx';
import { AppTitleBar } from '@/components/app/AppTitleBar.jsx';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { surfaceComponents } from './app-surfaces.jsx';
import { CommandPalette } from './features/command-palette/components/CommandPalette.jsx';
import { getRegisteredSidebarItems, getRegisteredSurfaces } from './extensions/registry.js';

const SIDEBAR_DEFAULT_WIDTH = 256;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 340;
const SIDEBAR_COLLAPSE_THRESHOLD = 160;

function getSurfaceIdFromHash(surfaces) {
  const hashSurfaceId = window.location.hash.replace(/^#/, '');

  if (surfaces.some((surface) => surface.id === hashSurfaceId)) {
    return hashSurfaceId;
  }

  return surfaces[0]?.id ?? '';
}

function App() {
  const sidebarItems = getRegisteredSidebarItems();
  const surfaces = getRegisteredSurfaces();
  const [activeSurfaceId, setActiveSurfaceId] = useState(() => getSurfaceIdFromHash(surfaces));
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const activeSurface = useMemo(
    () => surfaces.find((surface) => surface.id === activeSurfaceId) ?? surfaces[0],
    [activeSurfaceId, surfaces],
  );

  useEffect(() => {
    function handleHashChange() {
      setActiveSurfaceId(getSurfaceIdFromHash(surfaces));
    }

    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [surfaces]);

  function handleSelectSurface(surfaceId) {
    if (!surfaces.some((surface) => surface.id === surfaceId)) {
      return;
    }

    setActiveSurfaceId(surfaceId);
    window.history.replaceState(null, '', `#${surfaceId}`);
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

  return (
    <SidebarProvider
      className="min-h-0 flex-1"
      open={isSidebarOpen}
      onOpenChange={handleSidebarOpenChange}
      style={{
        '--sidebar-width': `${sidebarWidth}px`,
      }}
    >
      <CommandPalette onSelectSurface={handleSelectSurface} />
      <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
        <AppTitleBar />
        <div className="flex min-h-0 flex-1">
          <AppSidebar
            activeSurfaceId={activeSurface?.id}
            sidebarItems={sidebarItems}
            onSelectSurface={handleSelectSurface}
            onResizeSidebar={handleResizeSidebar}
            isSidebarOpen={isSidebarOpen}
            resizeMinWidth={SIDEBAR_MIN_WIDTH}
            resizeMaxWidth={SIDEBAR_MAX_WIDTH}
            resizeCollapseThreshold={SIDEBAR_COLLAPSE_THRESHOLD}
          />
          <SidebarInset className="min-h-0 bg-sidebar">
            <header className="flex h-14 shrink-0 items-center border-b border-border px-6">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-heading font-semibold tracking-normal text-foreground">
                  {activeSurface?.label ?? 'Dao'}
                </h1>
              </div>
            </header>

            <section className="flex-1 px-8 py-7">
              {activeSurface ? surfaceComponents[activeSurface.id] : null}
            </section>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default App;
