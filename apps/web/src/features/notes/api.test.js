import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteNote } from './api.js';

describe('notes api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deletes a note through the note endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteNote('note-1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notes/note-1',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  it('throws when deleting a note fails', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: 'note not found' }, { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteNote('note-1')).rejects.toThrow('Failed to delete note: 404');
  });
});
