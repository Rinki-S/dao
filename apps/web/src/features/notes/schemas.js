import { z } from 'zod';

export const NoteSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  content: z.string(),
  filePath: z.string().default(''),
  contentType: z.enum(['markdown']),
  noteType: z.enum(['general', 'project', 'learning', 'daily', 'interview']),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  version: z.number(),
  syncStatus: z.string(),
});

export const NoteListSchema = z.array(NoteSchema);

export const CreateNoteInputSchema = z.object({
  workspaceId: z.string().trim().min(1, { error: 'Workspace is required' }),
  projectId: z.string().trim().nullable(),
  title: z.string().trim().min(1, { error: 'Note title is required' }),
  content: z.string(),
  contentType: z.enum(['markdown']).default('markdown'),
  noteType: z.enum(['general', 'project', 'learning', 'daily', 'interview']).default('general'),
});

export const UpdateNoteContentInputSchema = z.object({
  content: z.string(),
  // What the editor believed the note said when it read it. The service refuses
  // the save if that is no longer true. Empty means "I have seen the conflict
  // and I mean it".
  expectedUpdatedAt: z.string().default(''),
});

// What comes back when a save is refused: the note as the app knows it, and the
// text that is actually on disk — so a choice can be offered without a second
// request to find out what is being chosen between.
export const NoteConflictSchema = z.object({
  note: NoteSchema,
  onDisk: z.string(),
  updatedAt: z.string(),
});

export const UpdateNoteInputSchema = z
  .object({
    title: z.string().trim().min(1, { error: 'Note title is required' }).optional(),
    noteType: z.enum(['general', 'project', 'learning', 'daily', 'interview']).optional(),
    // null moves the note to the workspace root, so it has to stay
    // distinguishable from the key being absent.
    projectId: z.string().min(1, { error: 'Note projectId is required' }).nullable().optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined || input.noteType !== undefined || input.projectId !== undefined,
    { error: 'Note update payload is required' },
  );
