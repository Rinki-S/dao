import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNote, updateNoteContent } from '../api.js';
import { NoteEditorPanel } from './NoteEditorPanel.jsx';

vi.mock('../api.js', () => ({
  getNote: vi.fn(),
  updateNoteContent: vi.fn(),
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
    updateNoteContent.mockResolvedValue(makeNote({ content: 'Updated content', version: 2 }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads markdown content for the selected note', async () => {
    render(<NoteEditorPanel noteId="note-1" />);

    expect(await screen.findByDisplayValue('Initial content')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Editor Plan' })).toBeInTheDocument();
    expect(getNote).toHaveBeenCalledWith('note-1');
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
});
