import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetNoteSaveQueueForTests } from '@/features/notes/note-save-queue.js';
import { listWorkspaces } from '@/features/workspaces/api.js';
import { getNote, NoteConflictError, updateNote, updateNoteContent } from '../api.js';
import { NoteEditorPanel } from './NoteEditorPanel.jsx';

vi.mock('../api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getNote: vi.fn(),
  updateNote: vi.fn(),
  updateNoteContent: vi.fn(),
}));

// The panel listens for changes the service noticed in the folder. Left to
// itself it would open a real stream against a service that is not there.
vi.mock('@/lib/workspace-events.js', () => ({
  watchWorkspace: vi.fn(() => () => {}),
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

    // The editor is behind a dynamic import that pulls in Tiptap, ProseMirror
    // and the Markdown parser. On a loaded machine resolving it takes longer
    // than findBy's default second — nothing this test is asserting.
    const editor = await screen.findByRole(
      'textbox',
      { name: 'Markdown note content' },
      { timeout: 10_000 },
    );
    await user.click(editor);
    await user.type(editor, 'Updated through Tiptap');

    await waitFor(
      () => {
        expect(updateNoteContent).toHaveBeenCalledWith('note-1', {
          content: 'Updated through Tiptap',
          // What the editor read. The service refuses the save if the file has
          // moved on since, which is what stops an autosave writing over an
          // edit made in another program.
          expectedUpdatedAt: '2026-05-26T00:00:00Z',
        });
      },
      { timeout: 2500 },
    );

    expect(screen.getByText('Saved')).toBeInTheDocument();
  });
});

describe('when the file changed underneath the editor', () => {
  beforeEach(() => {
    getNote.mockResolvedValue(makeNote({ content: 'listens on 8080' }));
    listWorkspaces.mockResolvedValue([]);
    resetNoteSaveQueueForTests();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function typeAndBeRefused() {
    updateNoteContent.mockRejectedValue(
      new NoteConflictError({
        note: makeNote({ updatedAt: '2026-05-26T01:00:00Z' }),
        onDisk: 'listens on 7743',
        updatedAt: '2026-05-26T01:00:00Z',
      }),
    );

    const user = userEvent.setup();
    render(<NoteEditorPanel noteId="note-1" />);

    const editor = await screen.findByLabelText('Markdown note content');
    await user.click(editor);
    await user.type(editor, 'mine');

    return user;
  }

  it('says so rather than failing, and offers a way out', async () => {
    await typeAndBeRefused();

    // Not an error. Nothing went wrong — two people wrote to one file.
    expect(
      await screen.findByText('This note changed on disk', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep mine' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take theirs' })).toBeInTheDocument();
  });

  it('can show the version it is asking about', async () => {
    const user = await typeAndBeRefused();
    await screen.findByText('This note changed on disk', {}, { timeout: 3000 });

    // Choosing against something invisible is not a choice.
    expect(screen.queryByText('listens on 7743')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show both' }));
    expect(screen.getByText('listens on 7743')).toBeInTheDocument();
  });

  it('writes over the file only when told to', async () => {
    const user = await typeAndBeRefused();
    await screen.findByText('This note changed on disk', {}, { timeout: 3000 });

    updateNoteContent.mockResolvedValue(makeNote({ updatedAt: '2026-05-26T02:00:00Z' }));
    await user.click(screen.getByRole('button', { name: 'Keep mine' }));

    // An empty expectation is how a caller says it has seen the conflict and
    // means it. Nothing else in the app sends one.
    await waitFor(() => {
      expect(updateNoteContent).toHaveBeenLastCalledWith(
        'note-1',
        expect.objectContaining({ expectedUpdatedAt: '' }),
      );
    });
  });
});
