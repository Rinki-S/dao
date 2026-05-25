import { useId, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/material-symbol.jsx';
import { searchAll } from '@/features/search/api.js';

export function AppSearchBar() {
  const searchInputId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const isPanelVisible = status !== 'idle' || query.trim() !== '';

  const panelContent = useMemo(() => {
    if (status === 'loading') {
      return <p className="px-3 py-2 text-sm text-muted-foreground">Searching...</p>;
    }

    if (status === 'error') {
      return <p className="px-3 py-2 text-sm text-destructive">{error}</p>;
    }

    if (status === 'ready' && results.length === 0) {
      return <p className="px-3 py-2 text-sm text-muted-foreground">No results found.</p>;
    }

    if (status === 'ready') {
      return (
        <ul className="flex max-h-80 flex-col overflow-y-auto p-1">
          {results.map((result) => (
            <li
              key={`${result.entityType}:${result.entityId}`}
              className="rounded-md px-2 py-2 hover:bg-muted"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block truncate text-sm font-medium text-foreground">
                    {result.title}
                  </strong>
                  <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                    {result.snippet || 'No snippet'}
                  </span>
                </div>
                <Badge variant="secondary">{result.entityType}</Badge>
              </div>
            </li>
          ))}
        </ul>
      );
    }

    return null;
  }, [error, results, status]);

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

  function handleQueryChange(event) {
    setQuery(event.target.value);

    if (event.target.value.trim() === '') {
      setResults([]);
      setError('');
      setStatus('idle');
    }
  }

  return (
    <div className="app-no-drag relative w-full max-w-md">
      <form
        className="flex h-8 items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
        onSubmit={handleSearch}
      >
        <MaterialSymbol name="search" className="text-muted-foreground" />
        <label className="sr-only" htmlFor={searchInputId}>
          Search
        </label>
        <Input
          id={searchInputId}
          className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          value={query}
          onChange={handleQueryChange}
          placeholder="Search"
          data-command-target="search-query"
        />
        {query.trim() !== '' && (
          <Button
            aria-label="Clear search"
            className="size-6"
            size="icon-xs"
            type="button"
            variant="ghost"
            onClick={() => {
              setQuery('');
              setResults([]);
              setError('');
              setStatus('idle');
            }}
          >
            <MaterialSymbol name="close" />
          </Button>
        )}
      </form>

      {isPanelVisible && (
        <div className="absolute top-10 left-0 z-50 w-full rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {panelContent}
        </div>
      )}
    </div>
  );
}
