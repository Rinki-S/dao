import { z } from 'zod';

export const WorkingDirectorySchema = z.object({
  path: z.string(),
  configured: z.boolean(),
});

export const UpdateWorkingDirectoryInputSchema = z.object({
  path: z.string().trim().min(1, { error: 'Working directory is required' }),
});

export const DirectoryPickerResultSchema = z.object({
  canceled: z.boolean(),
  path: z.string(),
});
