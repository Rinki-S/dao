import { z } from 'zod';

export const ActivitySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  projectId: z.string().nullable(),
  entityType: z.enum(['workspace', 'project', 'task', 'note']),
  entityId: z.string(),
  action: z.enum(['created']),
  metadataJson: z.string(),
  createdAt: z.string(),
});

export const ActivityListSchema = z.array(ActivitySchema);

export const ActivityMetricsSchema = z.object({
  totalCount: z.number(),
  workspaceCount: z.number(),
  projectCount: z.number(),
  taskCount: z.number(),
  noteCount: z.number(),
});
