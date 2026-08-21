import { useEffect, useState } from 'react';
import { IconCircleCheck, IconFile, IconFolder, IconSearch } from '@tabler/icons-react';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { searchAll } from '@/features/search/api.js';

const TYPE_ICONS = { project: IconFolder, task: IconCircleCheck, note: IconFile };

export function SearchWorkspace({ model }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!query.trim()) return undefined;
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setStatus('loading');
      try {
        const next = await searchAll({ query });
        if (!cancelled) {
          setResults(next.filter((item) => item.workspaceId === model.currentWorkspace?.id));
          setStatus('ready');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [model.currentWorkspace?.id, query]);

  return (
    <section className="dao-surface dao-search-workspace">
      <header className="dao-surface-header">
        <div>
          <p className="dao-eyebrow">Workspace</p>
          <h1>Search</h1>
          <p>Open notes, tasks, and folders without leaving your train of thought.</p>
        </div>
      </header>
      <InputGroup className="dao-search-input dao-corner">
        <InputGroupAddon>
          <IconSearch aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          autoFocus
          data-command-target="search-query"
          placeholder="Search everything…"
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            if (!nextQuery.trim()) {
              setResults([]);
              setStatus('idle');
            }
          }}
        />
      </InputGroup>
      <div className="dao-search-results">
        {status === 'loading'
          ? Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))
          : null}
        {status === 'ready' &&
          results.map((result) => {
            const Icon = TYPE_ICONS[result.entityType];
            return (
              <button
                key={`${result.entityType}:${result.entityId}`}
                className="dao-search-result dao-corner"
                type="button"
                onClick={() => model.revealSearchResult(result)}
              >
                <Icon aria-hidden="true" />
                <span>
                  <strong>{result.title}</strong>
                  <small>{result.snippet || result.entityType}</small>
                </span>
                <em>{result.entityType}</em>
              </button>
            );
          })}
        {status === 'ready' && results.length === 0 ? (
          <div className="dao-empty-state">
            <IconSearch aria-hidden="true" />
            <h2>No matches</h2>
            <p>Try a title, technical term, or phrase from a note.</p>
          </div>
        ) : null}
        {status === 'idle' ? (
          <div className="dao-empty-state dao-empty-state--quiet">
            <IconSearch aria-hidden="true" />
            <h2>Search your local workspace</h2>
            <p>Results come from Dao's SQLite full-text index.</p>
          </div>
        ) : null}
        {status === 'error' ? (
          <p className="dao-error" role="alert">
            Search is unavailable right now.
          </p>
        ) : null}
      </div>
    </section>
  );
}
