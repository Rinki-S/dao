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
});

export const UpdateNoteInputSchema = z
  .object({
    title: z.string().trim().min(1, { error: 'Note title is required' }).optional(),
    noteType: z.enum(['general', 'project', 'learning', 'daily', 'interview']).optional(),
  })
  .refine((input) => input.title !== undefined || input.noteType !== undefined, {
    error: 'Note update payload is required',
  });
