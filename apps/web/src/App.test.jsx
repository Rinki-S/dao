import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import App from './App.jsx';

function renderApp() {
  return render(
    <TooltipProvider>
      <App />
    </TooltipProvider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path) => {
        if (path === '/api/settings/working-directory') {
          return Response.json({
            path: '/tmp/dao-test',
            configured: true,
          });
        }

        if (path === '/api/workspaces') {
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
});
