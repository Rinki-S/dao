import { z } from 'zod';

export const ProjectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  description: z.string(),
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
  name: z.string().trim().min(1, { error: 'Project name is required' }),
  description: z.string().trim(),
});
