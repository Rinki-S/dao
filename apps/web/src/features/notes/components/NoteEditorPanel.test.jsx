import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNote, updateNote, updateNoteContent } from '../api.js';
import { listWorkspaces } from '@/features/workspaces/api.js';
import { NoteEditorPanel } from './NoteEditorPanel.jsx';

vi.mock('../api.js', () => ({
  getNote: vi.fn(),
  updateNote: vi.fn(),
  updateNoteContent: vi.fn(),
}));

vi.mock('@/features/workspaces/api.js', () => ({
  listWorkspaces: vi.fn(),
}));

vi.mock('@/features/activities/events.js', () => ({
  notifyActivityChanged: vi.fn(),
}));

function makeNote(overrides = {}) {
  return {
    id: 'note-1',
    workspaceId: 'workspace-1',
    projectId: null,
    title: 'Editor Plan',
    content: 'Initial content',
    filePath: '/tmp/dao/editor-plan.md',
    contentType: 'markdown',
    noteType: 'general',
    createdAt: '2026-05-26T00:00:00Z',
    updatedAt: '2026-05-26T00:00:00Z',
    deletedAt: null,
    version: 1,
    syncStatus: 'local',
    ...overrides,
  };
}

describe('NoteEditorPanel', () => {
  beforeEach(() => {
    getNote.mockResolvedValue(makeNote());
    updateNote.mockResolvedValue(makeNote({ title: 'Updated title', version: 2 }));
    updateNoteContent.mockResolvedValue(makeNote({ content: 'Updated content', version: 2 }));
    listWorkspaces.mockResolvedValue([
      {
        id: 'workspace-1',
        name: 'Test Workspace',
        createdAt: '2026-05-26T00:00:00Z',
        updatedAt: '2026-05-26T00:00:00Z',
        deletedAt: null,
        version: 1,
        syncStatus: 'local',
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads markdown content for the selected note', async () => {
    render(<NoteEditorPanel noteId="note-1" />);

    expect(await screen.findByDisplayValue('Initial content')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Editor Plan')).toBeInTheDocument();
    expect(getNote).toHaveBeenCalledWith('note-1');
  });

  it('autosaves edited note title after a debounce', async () => {
    render(<NoteEditorPanel noteId="note-1" />);

    const titleInput = await screen.findByLabelText('Note title');
    fireEvent.change(titleInput, { target: { value: 'Updated title' } });

    expect(screen.getByText('Saving...')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(updateNote).toHaveBeenCalledWith('note-1', { title: 'Updated title' });
      },
      { timeout: 2000 },
    );
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  it('autosaves edited markdown after a debounce', async () => {
    render(<NoteEditorPanel noteId="note-1" />);

    const editor = await screen.findByLabelText('Markdown note content');
    fireEvent.change(editor, { target: { value: 'Updated content' } });

    expect(screen.getByText('Saving...')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(updateNoteContent).toHaveBeenCalledWith('note-1', { content: 'Updated content' });
      },
      { timeout: 2000 },
    );
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  it('flushes pending markdown changes when switching notes', async () => {
    getNote.mockImplementation((noteId) =>
      Promise.resolve(
        makeNote({
          id: noteId,
          title: noteId === 'note-1' ? 'First Note' : 'Second Note',
          content: noteId === 'note-1' ? 'First content' : 'Second content',
        }),
      ),
    );

    const { rerender } = render(<NoteEditorPanel noteId="note-1" />);

    const editor = await screen.findByLabelText('Markdown note content');
    fireEvent.change(editor, { target: { value: 'Unsaved draft' } });

    rerender(<NoteEditorPanel noteId="note-2" />);

    await waitFor(() => {
      expect(updateNoteContent).toHaveBeenCalledWith('note-1', { content: 'Unsaved draft' });
    });
    expect(await screen.findByDisplayValue('Second content')).toBeInTheDocument();
  });

  it('flushes pending title changes when switching notes', async () => {
    getNote.mockImplementation((noteId) =>
      Promise.resolve(
        makeNote({
          id: noteId,
          title: noteId === 'note-1' ? 'First Note' : 'Second Note',
          content: noteId === 'note-1' ? 'First content' : 'Second content',
        }),
      ),
    );

    const { rerender } = render(<NoteEditorPanel noteId="note-1" />);

    const titleInput = await screen.findByLabelText('Note title');
    fireEvent.change(titleInput, { target: { value: 'Renamed Note' } });

    rerender(<NoteEditorPanel noteId="note-2" />);

    await waitFor(() => {
      expect(updateNote).toHaveBeenCalledWith('note-1', { title: 'Renamed Note' });
    });
    expect(await screen.findByDisplayValue('Second Note')).toBeInTheDocument();
  });
});
