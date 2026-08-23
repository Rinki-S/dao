import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DaoApp } from './DaoApp.jsx';

const mocks = vi.hoisted(() => ({
  model: {
    status: 'ready',
    error: '',
    workingDirectory: { configured: true, path: '/tmp/dao' },
    workspaces: [{ id: 'workspace-1', name: 'Personal', rootPath: '/tmp/dao/personal' }],
    currentWorkspace: { id: 'workspace-1', name: 'Personal', rootPath: '/tmp/dao/personal' },
    projects: [{ id: 'project-1', workspaceId: 'workspace-1', name: 'Compiler Lab' }],
    notes: [
      {
        id: 'note-1',
        workspaceId: 'workspace-1',
        projectId: null,
        title: 'Welcome Note',
        contentType: 'markdown',
        filePath: '/tmp/dao/personal/Welcome Note.md',
        createdAt: '2026-08-21T00:00:00Z',
        updatedAt: '2026-08-21T00:00:00Z',
      },
    ],
    tasks: [],
    activities: [],
    recents: [
      {
        workspaceId: 'workspace-1',
        entityType: 'note',
        entityId: 'note-1',
        title: 'Welcome Note',
        openedAt: '2026-08-21T00:00:00Z',
      },
    ],
    activeView: 'home',
    selectedEntity: { type: 'note', id: 'note-1' },
    selectedNote: {
      id: 'note-1',
      workspaceId: 'workspace-1',
      projectId: null,
      title: 'Welcome Note',
      contentType: 'markdown',
      filePath: '/tmp/dao/personal/Welcome Note.md',
      createdAt: '2026-08-21T00:00:00Z',
      updatedAt: '2026-08-21T00:00:00Z',
    },
    selectedTask: null,
    revealedProjectId: '',
    setActiveView: vi.fn(),
    selectWorkspace: vi.fn(),
    addWorkspace: vi.fn(),
    openHome: vi.fn(),
    openEntity: vi.fn(),
    addProject: vi.fn(),
    renameProject: vi.fn(),
    removeProject: vi.fn(),
    addNote: vi.fn(),
    renameNote: vi.fn(),
    removeNote: vi.fn(),
    addTask: vi.fn(),
    patchTask: vi.fn(),
    toggleTask: vi.fn(),
    removeTask: vi.fn(),
    revealSearchResult: vi.fn(),
  },
}));

vi.mock('./use-dao-workspace.js', () => ({ useDaoWorkspace: () => mocks.model }));
vi.mock('@/features/notes/components/NoteEditorPanel.jsx', () => ({
  NoteEditorPanel: ({ noteId }) => <div>Editor {noteId}</div>,
}));

describe('DaoApp shell', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts on the most recent note without a standalone home dashboard', () => {
    render(<DaoApp />);
    expect(screen.getByText('Editor note-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('keeps the open note out of Recents so only the tree marks it', () => {
    render(<DaoApp />);
    // note-1 is both the open note and the only recent, so Recents has nothing
    // left to offer and the group is gone with it.
    expect(screen.queryByText('Recents')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Welcome Note.md' })).toHaveLength(1);
  });

  it('treats project rows as folders and routes Tasks through primary navigation', async () => {
    const user = userEvent.setup();
    render(<DaoApp />);
    await user.click(screen.getByRole('button', { name: 'Compiler Lab' }));
    expect(screen.getByText('Editor note-1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tasks' }));
    expect(mocks.model.setActiveView).toHaveBeenCalledWith('tasks');
    await user.click(screen.getByRole('button', { name: 'Home' }));
    expect(mocks.model.openHome).toHaveBeenCalledTimes(1);
  });
});
