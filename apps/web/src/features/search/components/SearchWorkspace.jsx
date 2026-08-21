import { useEffect, useState } from 'react';
import { IconSearch } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge.jsx';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.jsx';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group.jsx';
import { ScrollArea } from '@/components/ui/scroll-area.jsx';
import { Spinner } from '@/components/ui/spinner.jsx';
import { searchAll } from '@/features/search/api.js';

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
    <section className="flex h-full min-h-0 flex-col">
      <header className="border-b p-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">Search</h1>
          <p className="text-muted-foreground text-sm">
            Open notes, tasks, and folders without leaving your train of thought.
          </p>
        </div>
      </header>
      <ScrollArea className="min-h-0 flex-1" overscrollContain>
        <div className="flex flex-col gap-4 p-4">
          <InputGroup>
            <InputGroupInput
              autoFocus
              aria-label="Search"
              data-command-target="search-query"
              placeholder="Search everything…"
              type="search"
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
            <InputGroupAddon>
              <IconSearch aria-hidden="true" />
            </InputGroupAddon>
          </InputGroup>
          {status === 'loading' ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <Spinner aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Searching…</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : null}
          {status === 'ready' &&
            results.map((result) => {
              return (
                <Card
                  key={`${result.entityType}:${result.entityId}`}
                  render={<button type="button" onClick={() => model.revealSearchResult(result)} />}
                >
                  <CardHeader>
                    <CardTitle>{result.title}</CardTitle>
                    <CardDescription>{result.snippet || result.entityType}</CardDescription>
                    <CardAction>
                      <Badge variant="secondary">{result.entityType}</Badge>
                    </CardAction>
                  </CardHeader>
                </Card>
              );
            })}
          {status === 'ready' && results.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconSearch aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No matches</EmptyTitle>
                <EmptyDescription>
                  Try a title, technical term, or phrase from a note.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {status === 'idle' ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconSearch aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Search your local workspace</EmptyTitle>
                <EmptyDescription>Results come from Dao's SQLite full-text index.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {status === 'error' ? (
            <Empty role="alert">
              <EmptyHeader>
                <EmptyTitle>Search is unavailable</EmptyTitle>
                <EmptyDescription>Try again in a moment.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </div>
      </ScrollArea>
    </section>
  );
}
