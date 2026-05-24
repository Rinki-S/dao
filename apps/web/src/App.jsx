import { Fragment } from 'react';
import { surfaceComponents } from './app-surfaces.jsx';
import { CommandPalette } from './features/command-palette/components/CommandPalette.jsx';
import { getRegisteredSidebarItems, getRegisteredSurfaces } from './extensions/registry.js';

function App() {
  const sidebarItems = getRegisteredSidebarItems();
  const surfaces = getRegisteredSurfaces();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <CommandPalette />
      <div className="grid min-h-screen grid-cols-[240px_1fr]">
        <aside className="border-r border-border bg-card px-5 py-6">
          <div className="mb-8 text-xl font-semibold tracking-normal">
            <span>dao</span>
            <span className="text-primary">.</span>
          </div>

          <nav className="grid gap-1 text-sm text-muted-foreground">
            {sidebarItems.map((item) => (
              <a
                key={item.id}
                className="rounded-md px-3 py-2 hover:bg-muted hover:text-foreground"
                href={item.href}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        <section className="px-8 py-7">
          <div className="mb-8 max-w-3xl">
            <p className="mb-2 text-xs font-medium uppercase text-primary">
              Local-first developer workspace
            </p>
            <h1 className="text-3xl font-semibold tracking-normal text-foreground">Dao</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              A calm workspace for projects, tasks, notes, and long-term developer growth.
            </p>
          </div>

          {surfaces.map((surface) => (
            <Fragment key={surface.id}>{surfaceComponents[surface.id]}</Fragment>
          ))}
        </section>
      </div>
    </main>
  );
}

export default App;
