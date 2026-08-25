import { z } from 'zod';

/**
 * A workspace's whole task list is one Markdown file. There is no per-task
 * record: a task is a checkbox line, a subtask is an indented one, a due date
 * is `@due(2026-08-25)` and a priority is `!high`.
 */
export const TaskDocumentSchema = z.object({
  workspaceId: z.string(),
  content: z.string(),
  filePath: z.string(),
  updatedAt: z.string(),
});

export const UpdateTaskDocumentInputSchema = z.object({
  content: z.string(),
});
