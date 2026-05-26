import { apiFetch } from '../../lib/api-client.js';
import { CreateNoteInputSchema, NoteListSchema, NoteSchema } from './schemas.js';

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
