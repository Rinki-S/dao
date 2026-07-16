import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetNoteSaveQueueForTests } from '@/features/notes/note-save-queue.js';
import { listWorkspaces } from '@/features/workspaces/api.js';
import { getNote, updateNote, updateNoteContent } from '../api.js';
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
    content: '',
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

describe('NoteEditorPanel Tiptap autosave integration', () => {
  beforeEach(() => {
    getNote.mockResolvedValue(makeNote());
    updateNote.mockResolvedValue(makeNote());
    updateNoteContent.mockImplementation((_noteId, { content }) =>
      Promise.resolve(makeNote({ content, version: 2 })),
    );
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

  afterEach(async () => {
    await resetNoteSaveQueueForTests();
    vi.clearAllMocks();
  });

  it('converts a real Tiptap edit to Markdown and sends it through autosave', async () => {
    const user = userEvent.setup();

    render(<NoteEditorPanel noteId="note-1" />);

    const editor = await screen.findByRole('textbox', { name: 'Markdown note content' });
    await user.click(editor);
    await user.type(editor, 'Updated through Tiptap');

    await waitFor(
      () => {
        expect(updateNoteContent).toHaveBeenCalledWith('note-1', {
          content: 'Updated through Tiptap',
        });
      },
      { timeout: 2500 },
    );

    expect(screen.getByText('Saved')).toBeInTheDocument();
  });
});
