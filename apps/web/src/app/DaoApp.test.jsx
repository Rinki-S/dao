import { fireEvent, render, screen } from '@testing-library/react';
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
    projects: [
      { id: 'project-1', workspaceId: 'workspace-1', parentId: null, name: 'Compiler Lab' },
      { id: 'project-2', workspaceId: 'workspace-1', parentId: 'project-1', name: 'Parser' },
      { id: 'project-3', workspaceId: 'workspace-1', parentId: 'project-2', name: 'Recovery' },
    ],
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
    moveProject: vi.fn(),
    removeProject: vi.fn(),
    addNote: vi.fn(),
    renameNote: vi.fn(),
    moveNote: vi.fn(),
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

  it('moves a note into the folder it is dropped on', () => {
    render(<DaoApp />);

    const note = screen.getByRole('button', { name: 'Welcome Note.md' });
    const folder = screen.getByRole('button', { name: 'Compiler Lab' });

    // jsdom has no drag implementation, so the payload is carried by a stub
    // shaped like the DataTransfer the handlers actually read.
    const carried = new Map();
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      get types() {
        return [...carried.keys()];
      },
      setData: (type, value) => carried.set(type, value),
      getData: (type) => carried.get(type) ?? '',
    };

    fireEvent.dragStart(note, { dataTransfer });
    fireEvent.dragOver(folder, { dataTransfer });
    fireEvent.drop(folder, { dataTransfer });

    // Exactly once: rows nest, so a drop that bubbled would be handled again
    // by every ancestor row and the note would land in the outermost one.
    expect(mocks.model.moveNote).toHaveBeenCalledTimes(1);
    expect(mocks.model.moveNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'note-1' }),
      'project-1',
    );
  });

  it('nests folders inside their parent to any depth', async () => {
    const user = userEvent.setup();
    render(<DaoApp />);

    // The first folder opens by default, so its child folder is already there.
    const child = screen.getByRole('button', { name: 'Parser' });
    expect(screen.queryByRole('button', { name: 'Recovery' })).not.toBeInTheDocument();

    // Opening it reveals a third level, which only happens if a folder row
    // renders folder rows itself rather than stopping at a fixed depth.
    await user.click(child);

    expect(screen.getByRole('button', { name: 'Recovery' })).toBeInTheDocument();
  });

  it('moves a folder into the folder it is dropped on, but never into itself', () => {
    render(<DaoApp />);

    const parent = screen.getByRole('button', { name: 'Compiler Lab' });
    const child = screen.getByRole('button', { name: 'Parser' });

    const carried = new Map();
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      get types() {
        return [...carried.keys()];
      },
      setData: (type, value) => carried.set(type, value),
      getData: (type) => carried.get(type) ?? '',
    };

    fireEvent.dragStart(child, { dataTransfer });
    fireEvent.drop(parent, { dataTransfer });

    expect(mocks.model.moveProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'project-2' }),
      'project-1',
    );

    // Dropping a folder on itself is refused by the row, so the service never
    // has to answer for a move it would reject anyway.
    mocks.model.moveProject.mockClear();
    fireEvent.dragStart(child, { dataTransfer });
    fireEvent.drop(child, { dataTransfer });

    expect(mocks.model.moveProject).not.toHaveBeenCalled();
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
