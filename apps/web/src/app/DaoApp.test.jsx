import { fireEvent, render, screen, within } from '@testing-library/react';
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
  beforeEach(() => {
    vi.clearAllMocks();
    // A test that drives a view change edits this, so it is reset rather than
    // left for whichever test runs next.
    mocks.model.activeView = 'home';
  });

  it('starts on the most recent note without a standalone home dashboard', () => {
    render(<DaoApp />);
    expect(screen.getByText('Editor note-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('labels only the current view in the primary navigation', () => {
    render(<DaoApp />);

    const navElement = screen.getByRole('navigation', { name: 'Primary' });
    const nav = within(navElement);

    // It sits with the workspace switcher in the header, which is outside the
    // scrolling region — moving it back under SidebarContent would make it
    // scroll away with the tree.
    expect(navElement.closest('[data-slot=sidebar-header]')).not.toBeNull();
    expect(navElement.closest('[data-slot=sidebar-content]')).toBeNull();

    // The label is what says where you are, so exactly one item carries text.
    const current = nav.getByRole('button', { name: 'Home' });
    expect(current).toHaveTextContent('Home');
    expect(current).toHaveAttribute('aria-current', 'page');

    // The rest read as icons. Their labels stay mounted so the pill can animate
    // between the two states, but text clipped to zero width is not something
    // anyone can perceive, so it is hidden from assistive technology too — the
    // name comes from aria-label either way.
    for (const label of ['Tasks', 'Chats', 'Search']) {
      const item = nav.getByRole('button', { name: label });
      expect(item).not.toHaveAttribute('aria-current');
      expect(within(item).getByText(label)).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('keeps the same nav button across a view change so it can animate', () => {
    const { rerender } = render(<DaoApp />);

    const home = screen.getByRole('button', { name: 'Home' });
    const tasks = screen.getByRole('button', { name: 'Tasks' });

    mocks.model.activeView = 'tasks';
    rerender(<DaoApp />);

    // Wrapping only the inactive items in a Tooltip would change the element
    // type at this position, and React would replace the button rather than
    // update it. A new node starts at its final style, so the pill would jump
    // however the transition is written.
    expect(screen.getByRole('button', { name: 'Home' })).toBe(home);
    expect(screen.getByRole('button', { name: 'Tasks' })).toBe(tasks);
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

  it('highlights only the folder a drop would land in', () => {
    render(<DaoApp />);

    const note = screen.getByRole('button', { name: 'Welcome Note.md' });
    const child = screen.getByRole('button', { name: 'Parser' });
    const parentRegion = screen.getByRole('button', { name: 'Compiler Lab' }).closest('li');
    const childRegion = child.closest('li');

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

    const lit = (element) => element.className.includes('bg-sidebar-accent');

    fireEvent.dragStart(note, { dataTransfer });
    fireEvent.dragOver(parentRegion, { dataTransfer });
    expect(lit(parentRegion)).toBe(true);

    // Entering a nested folder fires no leave on its parent, so the parent has
    // to stop being lit because the child claimed the drop, not because it was
    // told it was left.
    fireEvent.dragOver(childRegion, { dataTransfer });
    expect(lit(childRegion)).toBe(true);
    expect(lit(parentRegion)).toBe(false);

    // Leaving every folder falls back to the workspace root, which has to light
    // up too: an unlit tree is how a drag says the drop would do nothing.
    const rootRegion = screen
      .getByRole('button', { name: 'New note' })
      .closest('[data-slot=sidebar-group-content]');

    fireEvent.dragLeave(childRegion, { dataTransfer, relatedTarget: rootRegion });
    fireEvent.dragOver(rootRegion, { dataTransfer });
    expect(lit(rootRegion)).toBe(true);
    expect(lit(childRegion)).toBe(false);

    // A drag abandoned without a drop must not leave the tree lit.
    fireEvent.dragEnd(note, { dataTransfer });
    expect(lit(rootRegion)).toBe(false);
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
