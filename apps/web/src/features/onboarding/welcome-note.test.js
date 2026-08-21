import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureWelcomeNote, WELCOME_NOTE_CONTENT } from './welcome-note.js';
import { createNote } from '@/features/notes/api.js';

vi.mock('@/features/notes/api.js', () => ({ createNote: vi.fn() }));

describe('Welcome Note bootstrap', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reuses an existing root Welcome Note', async () => {
    const note = {
      id: 'note-1',
      workspaceId: 'workspace-1',
      projectId: null,
      title: 'Welcome Note',
    };
    await expect(ensureWelcomeNote({ id: 'workspace-1' }, [note])).resolves.toBe(note);
    expect(createNote).not.toHaveBeenCalled();
  });

  it('creates the Markdown welcome note only when missing', async () => {
    createNote.mockResolvedValue({ id: 'note-1' });
    await ensureWelcomeNote({ id: 'workspace-1' }, []);
    expect(createNote).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        projectId: null,
        title: 'Welcome Note',
        content: WELCOME_NOTE_CONTENT,
        contentType: 'markdown',
        noteType: 'general',
      }),
    );
  });
});
