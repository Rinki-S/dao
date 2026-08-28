import { apiFetch } from '../../lib/api-client.js';
import {
  CreateNoteInputSchema,
  NoteConflictSchema,
  NoteListSchema,
  NoteSchema,
  UpdateNoteContentInputSchema,
  UpdateNoteInputSchema,
} from './schemas.js';

export async function listNotes() {
  const response = await apiFetch('/api/notes');

  if (!response.ok) {
    throw new Error(`Failed to list notes: ${response.status}`);
  }

  const data = await response.json();
  return NoteListSchema.parse(data);
}

export async function getNote(id) {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}`);

  if (!response.ok) {
    throw new Error(`Failed to get note: ${response.status}`);
  }

  const data = await response.json();
  return NoteSchema.parse(data);
}

export async function createNote(input) {
  const payload = CreateNoteInputSchema.parse(input);

  const response = await apiFetch('/api/notes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to create note: ${response.status}`);
  }

  const data = await response.json();
  return NoteSchema.parse(data);
}

/**
 * A save that was refused because the file moved on underneath it.
 *
 * Carries the other version, because the editor has to let somebody choose and
 * a choice against something invisible is not one.
 */
export class NoteConflictError extends Error {
  constructor(conflict) {
    super('This note changed on disk');
    this.name = 'NoteConflictError';
    this.note = conflict.note;
    this.onDisk = conflict.onDisk;
  }
}

export async function updateNoteContent(id, input) {
  const payload = UpdateNoteContentInputSchema.parse(input);

  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}/content`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  // Refused, not failed: something else changed the file since this editor read
  // it. The body says what, so the caller can offer a choice rather than an
  // apology.
  if (response.status === 409) {
    throw new NoteConflictError(NoteConflictSchema.parse(await response.json()));
  }

  if (!response.ok) {
    throw new Error(`Failed to update note content: ${response.status}`);
  }

  const data = await response.json();
  return NoteSchema.parse(data);
}

export async function updateNote(id, input) {
  const payload = UpdateNoteInputSchema.parse(input);

  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to update note: ${response.status}`);
  }

  const data = await response.json();
  return NoteSchema.parse(data);
}

export async function deleteNote(id) {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete note: ${response.status}`);
  }
}
