import { createElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNote, listNotes } from '@/features/notes/api.js';
import { createProject, listProjects } from '@/features/projects/api.js';
import { ProjectTree } from './ProjectTree.jsx';

vi.mock('@/features/projects/api.js', () => ({
  createProject: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock('@/features/notes/api.js', () => ({
  createNote: vi.fn(),
  listNotes: vi.fn(),
}));

vi.mock('@/features/activities/events.js', () => ({
  notifyActivityChanged: vi.fn(),
  subscribeToActivityChanged: vi.fn(() => vi.fn()),
}));

const currentWorkspace = {
  id: 'workspace-1',
  name: 'Personal',
  description: '',
  rootPath: '/tmp/dao-test/personal-workspace-1',
  createdAt: '2026-05-25T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
  deletedAt: null,
  version: 1,
  syncStatus: 'synced',
};

function projectFixture(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function noteFixture(overrides = {}) {
  return {
    id: 'note-1',
    workspaceId: 'workspace-1',
    projectId: null,
    title: 'Root note',
    content: '',
    filePath: '/tmp/dao-test/personal-workspace-1/root-note.md',
    contentType: 'markdown',
    noteType: 'general',
    createdAt: '2026-05-25T00:00:00Z',
    updatedAt: '2026-05-25T00:00:00Z',
    deletedAt: null,
    version: 1,
    syncStatus: 'synced',
    ...overrides,
  };
}

function renderProjectTree(props = {}) {
  return render(
    createElement(ProjectTree, {
      currentWorkspace,
      selectedProjectId: '',
      selectedNoteId: '',
      onSelectProject: vi.fn(),
      onSelectNote: vi.fn(),
      onContentCreated: vi.fn(),
      ...props,
    }),
  );
}

describe('ProjectTree interactions', () => {
  beforeEach(() => {
    listProjects.mockResolvedValue([projectFixture()]);
    listNotes.mockResolvedValue([noteFixture()]);
    createProject.mockResolvedValue(projectFixture({ id: 'project-2', name: 'New Project' }));
    createNote.mockResolvedValue(noteFixture({ id: 'note-2', title: 'New Note' }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the project tree mounted when project creation fails', async () => {
    const user = userEvent.setup();
    createProject.mockRejectedValue(new Error('Unable to create project'));

    const { container } = renderProjectTree();

    expect(await screen.findByRole('button', { name: 'Dao Project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Root note' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create project' }));

    const dialog = await screen.findByRole('dialog', { name: 'Create project' });
    await user.type(within(dialog).getByLabelText('Project name'), 'New Project');
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledTimes(1);
    });

    expect(await within(dialog).findByText('Unable to create project')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Create project' })).toBeInTheDocument();
    expect(within(container).getByText('Dao Project')).toBeInTheDocument();
    expect(within(container).getByText('Root note')).toBeInTheDocument();
    expect(listProjects).toHaveBeenCalledTimes(1);
    expect(listNotes).toHaveBeenCalledTimes(1);
  });

  it('keeps the project tree mounted when note creation fails', async () => {
    const user = userEvent.setup();
    createNote.mockRejectedValue(new Error('Unable to create note'));

    const { container } = renderProjectTree();

    expect(await screen.findByRole('button', { name: 'Dao Project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Root note' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create content' }));

    const dialog = await screen.findByRole('dialog', { name: 'Create content' });
    await user.type(within(dialog).getByLabelText('Note title'), 'New Note');
    await user.click(within(dialog).getByRole('button', { name: 'Create content' }));

    await waitFor(() => {
      expect(createNote).toHaveBeenCalledTimes(1);
    });

    expect(await within(dialog).findByText('Unable to create note')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Create content' })).toBeInTheDocument();
    expect(within(container).getByText('Dao Project')).toBeInTheDocument();
    expect(within(container).getByText('Root note')).toBeInTheDocument();
    expect(listProjects).toHaveBeenCalledTimes(1);
    expect(listNotes).toHaveBeenCalledTimes(1);
  });
});
