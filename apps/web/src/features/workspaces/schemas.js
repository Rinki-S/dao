import { z } from 'zod';

export const WorkspaceSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable(),
    version: z.number(),
    syncStatus: z.string(),
});

export const WorkspaceListSchema = z.array(WorkspaceSchema);