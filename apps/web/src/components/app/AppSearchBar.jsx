import { useEffect, useId, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { searchAll } from '@/features/search/api.js';

export function AppSearchBar() {
  const searchInputId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const trimmedQuery = query.trim();
  const isPanelVisible = trimmedQuery !== '';
  const displayStatus = isPanelVisible && status === 'idle' ? 'pending' : status;

  const panelContent = useMemo(() => {
    if (displayStatus === 'loading' || displayStatus === 'pending') {
      return <p className="px-3 py-2 text-sm text-muted-foreground">Searching...</p>;
    }

    if (displayStatus === 'error') {
      return <p className="px-3 py-2 text-sm text-destructive">{error}</p>;
    }

    if (displayStatus === 'ready' && results.length === 0) {
      return <p className="px-3 py-2 text-sm text-muted-foreground">No results found.</p>;
    }

    if (displayStatus === 'ready') {
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
  }, [displayStatus, error, results]);

  useEffect(() => {
    if (trimmedQuery === '') {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        setStatus('loading');
        setError('');

        const nextResults = await searchAll({ query: trimmedQuery });

        if (cancelled) {
          return;
        }

        setResults(nextResults);
        setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to search');
          setStatus('error');
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [trimmedQuery]);

  function handleSearch(event) {
    event.preventDefault();
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
        <HugeiconsIcon
          icon={Search01Icon}
          className="size-[18px] shrink-0 translate-y-px text-muted-foreground"
        />
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
            <HugeiconsIcon
              icon={Cancel01Icon}
              className="size-[18px] shrink-0 translate-y-px"
            />
          </Button>
        )}
      </form>

      {isPanelVisible && (
        <div className="absolute top-10 left-0 z-[100] w-full rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {panelContent}
        </div>
      )}
    </div>
  );
}
