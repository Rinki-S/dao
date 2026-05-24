import { useEffect, useMemo, useState } from 'react';
import { AppSidebar } from '@/components/app/AppSidebar.jsx';
import { AppTitleBar } from '@/components/app/AppTitleBar.jsx';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { surfaceComponents } from './app-surfaces.jsx';
import { CommandPalette } from './features/command-palette/components/CommandPalette.jsx';
import { getRegisteredSidebarItems, getRegisteredSurfaces } from './extensions/registry.js';

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

  return (
    <SidebarProvider className="min-h-0 flex-1">
      <CommandPalette onSelectSurface={handleSelectSurface} />
      <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
        <AppTitleBar />
        <div className="flex min-h-0 flex-1">
          <AppSidebar
            activeSurfaceId={activeSurface?.id}
            sidebarItems={sidebarItems}
            onSelectSurface={handleSelectSurface}
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
