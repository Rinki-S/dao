import { z } from 'zod';

export const SearchResultSchema = z.object({
  entityType: z.enum(['project', 'task', 'note']),
  entityId: z.string(),
  workspaceId: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  snippet: z.string(),
});

export const SearchResultListSchema = z.array(SearchResultSchema);

export const SearchQueryInputSchema = z.object({
  query: z.string().trim(),
});
