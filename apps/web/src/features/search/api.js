import { apiFetch } from '../../lib/api-client.js';
import { SearchQueryInputSchema, SearchResultListSchema } from './schemas.js';

export async function searchAll(input) {
  const { query } = SearchQueryInputSchema.parse(input);

  if (query === '') {
    return [];
  }

  const params = new URLSearchParams({
    q: query,
  });

  const response = await apiFetch(`/api/search?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to search: ${response.status}`);
  }

  const data = await response.json();
  return SearchResultListSchema.parse(data);
}
