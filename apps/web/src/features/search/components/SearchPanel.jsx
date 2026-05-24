import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { searchAll } from '../api.js';

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  async function handleSearch(event) {
    event.preventDefault();

    const nextQuery = query.trim();
    if (nextQuery === '') {
      setResults([]);
      setError('');
      setStatus('idle');
      return;
    }

    try {
      setStatus('loading');
      setError('');

      const nextResults = await searchAll({ query: nextQuery });

      setResults(nextResults);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search');
      setStatus('error');
    }
  }

  return (
    <Card id="search" className="mt-6 max-w-3xl">
      <CardHeader>
        <CardTitle>Search</CardTitle>
        <CardDescription>
          Search across projects, tasks, and notes created after the search index was added.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSearch}>
          <label className="sr-only" htmlFor="search-query">
            Search query
          </label>
          <Input
            id="search-query"
            className="min-w-0 flex-1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects, tasks, and notes"
            data-command-target="search-query"
          />

          <Button className="w-fit" disabled={status === 'loading'} type="submit">
            {status === 'loading' ? 'Searching...' : 'Search'}
          </Button>
        </form>

        {status === 'idle' && (
          <p className="text-sm text-muted-foreground">Enter a keyword to search local Dao data.</p>
        )}

        {status === 'error' && <p className="text-sm text-destructive">{error}</p>}

        {status === 'ready' && results.length === 0 && (
          <p className="text-sm text-muted-foreground">No results found.</p>
        )}

        {status === 'ready' && results.length > 0 && (
          <ul className="flex flex-col gap-2">
            {results.map((result) => (
              <li
                key={`${result.entityType}:${result.entityId}`}
                className="rounded-md border border-border px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="block text-sm font-medium text-foreground">
                      {result.title}
                    </strong>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {result.snippet || 'No snippet'}
                    </span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      workspace {result.workspaceId}
                      {result.projectId ? ` / project ${result.projectId}` : ''}
                    </span>
                  </div>

                  <Badge variant="secondary">{result.entityType}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
