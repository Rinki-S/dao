import { useEffect, useMemo, useRef, useState } from 'react';
import { Chip, Label, SearchField } from '@heroui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import { searchAll } from '@/features/search/api.js';

export function AppSearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const listRef = useRef(null);
  const trimmedQuery = query.trim();
  const isPanelVisible = trimmedQuery !== '';
  const displayStatus = isPanelVisible && status === 'idle' ? 'pending' : status;

  const panelContent = useMemo(() => {
    if (displayStatus === 'loading' || displayStatus === 'pending') {
      return <p className="px-3 py-2 text-sm text-muted">Searching...</p>;
    }

    if (displayStatus === 'error') {
      return <p className="px-3 py-2 text-sm text-danger">{error}</p>;
    }

    if (displayStatus === 'ready' && results.length === 0) {
      return <p className="px-3 py-2 text-sm text-muted">No results found.</p>;
    }

    if (displayStatus === 'ready') {
      return (
        <ul ref={listRef} className="flex max-h-80 flex-col overflow-y-auto p-1">
          {results.map((result, index) => (
            <li
              key={`${result.entityType}:${result.entityId}`}
              className={`rounded-lg px-2 py-2 hover:bg-surface-secondary ${
                index === selectedIndex ? 'bg-accent-soft' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block truncate text-sm font-medium text-foreground">
                    {result.title}
                  </strong>
                  <span className="mt-1 line-clamp-2 block text-xs text-muted">
                    {result.snippet || 'No snippet'}
                  </span>
                </div>
                <Chip size="sm" variant="soft">
                  {result.entityType}
                </Chip>
              </div>
            </li>
          ))}
        </ul>
      );
    }

    return null;
  }, [displayStatus, error, results, selectedIndex]);

  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('li');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

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

  function handleQueryChange(nextQuery) {
    setQuery(nextQuery);
    setSelectedIndex(-1);

    if (nextQuery.trim() === '') {
      setResults([]);
      setError('');
      setStatus('idle');
    }
  }

  return (
    <div className="app-no-drag relative w-full max-w-md">
      <SearchField
        className="w-full"
        name="app-search"
        variant="primary"
        value={query}
        onChange={handleQueryChange}
        onKeyDown={(e) => {
          if (!isPanelVisible || displayStatus !== 'ready') return;
          
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => 
              prev < results.length - 1 ? prev + 1 : 0
            );
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => 
              prev > 0 ? prev - 1 : results.length - 1
            );
          } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            const selected = results[selectedIndex];
            if (selected) {
              // TODO: Navigate to selected result
              console.log('Selected:', selected);
            }
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setQuery('');
            setResults([]);
            setStatus('idle');
            setSelectedIndex(-1);
          }
        }}
      >
        <Label className="sr-only">Search</Label>
        <SearchField.Group className="h-8 gap-1 rounded-field border border-border px-2 shadow-none data-[focus-within=true]:border-ring data-[focus-within=true]:ring-3 data-[focus-within=true]:ring-ring/50">
          <SearchField.SearchIcon className="m-0 text-muted-foreground">
            <HugeiconsIcon icon={Search01Icon} className="size-[18px] shrink-0 translate-y-px" />
          </SearchField.SearchIcon>
          <SearchField.Input
            className="h-auto min-w-0 flex-1 px-0 py-0"
            data-command-target="search-query"
            placeholder="Search"
          />
          <SearchField.ClearButton aria-label="Clear search" className="mr-0 size-6 min-w-0 p-0">
            <HugeiconsIcon icon={Cancel01Icon} className="size-[18px] shrink-0 translate-y-px" />
          </SearchField.ClearButton>
        </SearchField.Group>
      </SearchField>

      {isPanelVisible && (
        <div className="absolute top-10 left-0 z-[100] w-full rounded-xl bg-overlay text-overlay-foreground shadow-md ring-1 ring-border">
          {panelContent}
        </div>
      )}
    </div>
  );
}
