import { createNote } from '@/features/notes/api.js';

export const WELCOME_NOTE_TITLE = 'Welcome Note';

export const WELCOME_NOTE_CONTENT = `# Welcome to Dao

Your local workspace is ready.

## Start here

Dao helps you stay focused by keeping everything local and organized.

- Projects are just folders on your computer.
- Notes are saved as Markdown files and always remain local.
- Tasks help you plan and track work.
- Use Search to open anything instantly.

## How Dao stores your work

Your workspace is a folder on your computer.
All notes are plain Markdown files in that folder and its subfolders.
Nothing leaves this device by default.

You are always in control—open your folder in Finder at any time to see your files.

Happy writing!
`;

export async function ensureWelcomeNote(workspace, notes) {
  const existing = notes.find(
    (note) =>
      note.workspaceId === workspace.id &&
      note.projectId === null &&
      note.title.trim().toLocaleLowerCase() === WELCOME_NOTE_TITLE.toLocaleLowerCase(),
  );

  if (existing) return existing;

  return createNote({
    workspaceId: workspace.id,
    projectId: null,
    title: WELCOME_NOTE_TITLE,
    content: WELCOME_NOTE_CONTENT,
    contentType: 'markdown',
    noteType: 'general',
  });
}
