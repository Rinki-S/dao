import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

function renderApp() {
  return render(<App />);
}

async function readSource(path) {
  return await fetch(new URL(path, import.meta.url)).then((response) => response.text());
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path) => {
        const pathname = new URL(path, window.location.origin).pathname;

        if (pathname === '/api/settings/working-directory') {
          return Response.json({
            path: '/tmp/dao-test',
            configured: true,
          });
        }

        if (pathname === '/api/workspaces') {
          return Response.json([
            {
              id: 'workspace-1',
              name: 'Personal',
              description: '',
              rootPath: '/tmp/dao-test/personal-workspace-1',
              createdAt: '2026-05-25T00:00:00Z',
              updatedAt: '2026-05-25T00:00:00Z',
              deletedAt: null,
              version: 1,
              syncStatus: 'synced',
            },
          ]);
        }

        if (pathname === '/api/projects') {
          return Response.json([
            {
              id: 'project-1',
              workspaceId: 'workspace-1',
              name: 'Dao Project',
              description: '',
              folderPath: '/tmp/dao-test/personal-workspace-1/dao-project',
              status: 'active',
              startedAt: null,
              endedAt: null,
              createdAt: '2026-05-25T00:00:00Z',
              updatedAt: '2026-05-25T00:00:00Z',
              deletedAt: null,
              version: 1,
              syncStatus: 'synced',
            },
          ]);
        }

        if (pathname === '/api/notes') {
          return Response.json([]);
        }

        return Response.json([]);
      }),
    );
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.unstubAllGlobals();
  });

  it('renders only the active surface from the sidebar', async () => {
    const user = userEvent.setup();

    renderApp();

    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Dao Project' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Settings' }));

    expect(window.location.hash).toBe('#settings');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tasks' })).not.toBeInTheDocument();
  });

  it('switches surfaces from the command palette', async () => {
    const user = userEvent.setup();

    renderApp();

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(screen.getByPlaceholderText('Type a command'), 'open notes');
    await user.keyboard('{Enter}');

    expect(window.location.hash).toBe('#notes');
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument();
  });

  it('does not depend on the legacy shadcn sidebar provider in the app shell', async () => {
    const [appSource, titleBarSource, sidebarSource, projectTreeSource, workspaceSwitcherSource] =
      await Promise.all([
        readSource('./App.jsx'),
        readSource('./components/app/AppTitleBar.jsx'),
        readSource('./components/app/AppSidebar.jsx'),
        readSource('./components/app/ProjectTree.jsx'),
        readSource('./components/app/WorkspaceSwitcher.jsx'),
      ]);

    expect(appSource).not.toContain('@/components/ui/sidebar');
    expect(appSource).not.toContain('SidebarProvider');
    expect(appSource).not.toContain('SidebarInset');
    expect(titleBarSource).not.toContain('@/components/ui/sidebar');
    expect(sidebarSource).not.toContain('@/components/ui/sidebar');
    expect(projectTreeSource).not.toContain('@/components/ui/sidebar');
    expect(workspaceSwitcherSource).not.toContain('@/components/ui/sidebar');
  });
});
