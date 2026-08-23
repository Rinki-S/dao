import { z } from 'zod';

export const ProjectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  folderPath: z.string(),
  status: z.enum(['active', 'paused', 'completed', 'archived']),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  version: z.number(),
  syncStatus: z.string(),
});

export const ProjectListSchema = z.array(ProjectSchema);

export const CreateProjectInputSchema = z.object({
  workspaceId: z.string().trim().min(1, { error: 'Workspace is required' }),
  parentId: z.string().min(1, { error: 'Project parentId is required' }).nullable().optional(),
  name: z.string().trim().min(1, { error: 'Project name is required' }),
  description: z.string().trim(),
});

export const UpdateProjectInputSchema = z.object({
  name: z.string().trim().min(1, { error: 'Project name is required' }).optional(),
  description: z.string().trim().optional(),
  // null moves the folder to the workspace root, so it has to stay
  // distinguishable from the key being absent.
  parentId: z.string().min(1, { error: 'Project parentId is required' }).nullable().optional(),
});

export const DeleteProjectInputSchema = z.object({
  deleteNotes: z.boolean().default(false),
});
