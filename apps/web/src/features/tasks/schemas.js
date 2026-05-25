import { z } from 'zod';

export const TaskSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  projectId: z.string().nullable(),
  parentId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['todo', 'doing', 'done', 'archived']),
  priority: z.enum(['low', 'medium', 'high']),
  dueDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  version: z.number(),
  syncStatus: z.string(),
});

export const TaskListSchema = z.array(TaskSchema);

export const CreateTaskInputSchema = z.object({
  workspaceId: z.string().trim().min(1, { error: 'Workspace is required' }),
  projectId: z.string().trim().nullable(),
  parentId: z.string().trim().nullable().default(null),
  title: z.string().trim().min(1, { error: 'Task title is required' }),
  description: z.string().trim(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.string().trim().nullable(),
});

export const UpdateTaskStatusInputSchema = z.object({
  status: z.enum(['todo', 'done']),
});
