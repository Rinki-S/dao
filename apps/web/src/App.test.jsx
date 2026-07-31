import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetNoteSaveQueueForTests, waitForNoteSaves } from '@/features/notes/note-save-queue.js';
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
          return Response.json([
            {
              id: 'note-1',
              workspaceId: 'workspace-1',
              projectId: 'project-1',
              title: 'README',
              content: '# README',
              noteType: 'project',
              contentType: 'markdown',
              filePath: '/tmp/dao-test/personal-workspace-1/dao-project/README.md',
              createdAt: '2026-05-25T00:00:00Z',
              updatedAt: '2026-05-25T00:00:00Z',
              deletedAt: null,
              version: 1,
              syncStatus: 'synced',
            },
          ]);
        }

        if (pathname === '/api/notes/note-1') {
          return Response.json({
            id: 'note-1',
            workspaceId: 'workspace-1',
            projectId: 'project-1',
            title: 'README',
            content: '# README',
            noteType: 'project',
            contentType: 'markdown',
            filePath: '/tmp/dao-test/personal-workspace-1/dao-project/README.md',
            createdAt: '2026-05-25T00:00:00Z',
            updatedAt: '2026-05-25T00:00:00Z',
            deletedAt: null,
            version: 1,
            syncStatus: 'synced',
          });
        }

        return Response.json([]);
      }),
    );
  });

  afterEach(async () => {
    await resetNoteSaveQueueForTests();
    window.history.replaceState(null, '', '/');
    vi.unstubAllGlobals();
  });

  it('starts with no open tabs and opens surfaces from the sidebar', async () => {
    const user = userEvent.setup();

    renderApp();

    expect(await screen.findByText('No tab open')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No page open' })).toBeInTheDocument();
    expect(screen.queryByText('No tasks yet')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tasks' }));

    expect(screen.getByRole('tab', { name: /Tasks/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('No tasks yet')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Settings' }));

    expect(window.location.hash).toBe('#settings');
    expect(screen.getByRole('tab', { name: /Settings/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Working Directory')).toBeInTheDocument();
    expect(screen.queryByText('No tasks yet')).not.toBeInTheDocument();
  });

  it('opens a surface tab from the command palette', async () => {
    const user = userEvent.setup();

    renderApp();

    await screen.findByText('No tab open');
    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(screen.getByPlaceholderText('Type a command'), 'open settings');
    await user.keyboard('{Enter}');

    expect(window.location.hash).toBe('#settings');
    expect(screen.getByRole('tab', { name: /Settings/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Working Directory')).toBeInTheDocument();
    // The dialog stays mounted until its exit animation finishes.
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument();
    });
  });

  it('reuses existing surface tabs and closes active tabs to the left neighbor', async () => {
    const user = userEvent.setup();

    renderApp();

    await screen.findByText('No tab open');
    await user.click(screen.getByRole('button', { name: 'Tasks' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Tasks' }));

    expect(screen.getAllByRole('tab', { name: /Tasks/ })).toHaveLength(1);
    expect(screen.getByRole('tab', { name: /Tasks/ })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: 'Close Tasks tab' }));

    expect(screen.queryByRole('tab', { name: /Tasks/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Settings/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the empty state after closing the final tab', async () => {
    const user = userEvent.setup();

    renderApp();

    await screen.findByText('No tab open');
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Close Settings tab' }));

    expect(screen.getByText('No tab open')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No page open' })).toBeInTheDocument();
  });

  it('opens project and note tabs with resource titles and dedupes them', async () => {
    const user = userEvent.setup();

    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Dao Project' }));

    expect(screen.getByRole('tab', { name: /Dao Project/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(await screen.findByRole('button', { name: 'README' }));

    expect(screen.getByRole('tab', { name: /README/ })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: 'Dao Project' }));
    await user.click(screen.getByRole('button', { name: 'Dao Project' }));
    await user.click(await screen.findByRole('button', { name: 'README' }));

    expect(screen.getAllByRole('tab', { name: /Dao Project/ })).toHaveLength(1);
    expect(screen.getAllByRole('tab', { name: /README/ })).toHaveLength(1);
  });

  it('flushes a real Tiptap edit when the active note tab closes', async () => {
    const user = userEvent.setup();
    const defaultFetch = fetch.getMockImplementation();
    let diskContent = '# README';

    fetch.mockImplementation(async (path, options = {}) => {
      const pathname = new URL(path, window.location.origin).pathname;

      if (pathname === '/api/notes/note-1/content' && options.method === 'PUT') {
        diskContent = JSON.parse(options.body).content;
        return Response.json({
          id: 'note-1',
          workspaceId: 'workspace-1',
          projectId: 'project-1',
          title: 'README',
          content: diskContent,
          noteType: 'project',
          contentType: 'markdown',
          filePath: '/tmp/dao-test/personal-workspace-1/dao-project/README.md',
          createdAt: '2026-05-25T00:00:00Z',
          updatedAt: '2026-05-25T00:00:01Z',
          deletedAt: null,
          version: 2,
          syncStatus: 'local',
        });
      }

      return defaultFetch(path, options);
    });

    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Dao Project' }));
    await user.click(await screen.findByRole('button', { name: 'README' }));
    const editor = await screen.findByRole('textbox', { name: 'Markdown note content' });
    const headingText = editor.querySelector('h1')?.firstChild;
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(headingText, headingText.textContent.length);
    range.collapse(true);
    editor.focus();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));

    await user.type(editor, ' saved on close', { skipClick: true });
    expect(diskContent).toBe('# README');
    await user.click(screen.getByRole('button', { name: 'Close README tab' }));

    await waitForNoteSaves('note-1');

    expect(screen.queryByRole('tab', { name: /README/ })).not.toBeInTheDocument();
    expect(diskContent).toBe('# README saved on close\n\n');
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
