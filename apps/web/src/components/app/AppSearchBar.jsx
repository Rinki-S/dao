import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconSearch, IconX } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge.jsx';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { searchAll } from '@/features/search/api.js';
import { CornerSurface } from '@/lib/corners.jsx';
import { gsap } from 'gsap';

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function AppSearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const listRef = useRef(null);
  const panelRef = useRef(null);
  const containerRef = useRef(null);
  const [shouldRender, setShouldRender] = useState(false);
  const trimmedQuery = query.trim();
  const isPanelVisible = trimmedQuery !== '';
  const displayStatus = isPanelVisible && status === 'idle' ? 'pending' : status;

  const panelContent = useMemo(() => {
    if (displayStatus === 'loading' || displayStatus === 'pending') {
      return (
        <div className="space-y-2 p-2" data-testid="search-loading-skeleton">
          <div className="space-y-1 px-2 py-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <div className="space-y-1 px-2 py-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      );
    }

    if (displayStatus === 'error') {
      return <p className="px-3 py-2 text-sm text-destructive">{error}</p>;
    }

    if (displayStatus === 'ready' && results.length === 0) {
      return <p className="px-3 py-2 text-sm text-muted-foreground">No results found.</p>;
    }

    if (displayStatus === 'ready') {
      return (
        <ul ref={listRef} className="flex max-h-80 flex-col overflow-y-auto p-1">
          {results.map((result, index) => (
            <CornerSurface
              as="li"
              key={`${result.entityType}:${result.entityId}`}
              corner="md"
              dataSlot="search-result"
              className={`px-2 py-2 hover:bg-surface-secondary ${
                index === selectedIndex ? 'bg-accent-soft' : ''
              }`}
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
            </CornerSurface>
          ))}
        </ul>
      );
    }

    return null;
  }, [displayStatus, error, results, selectedIndex]);

  useEffect(() => {
    if (!isPanelVisible) return;

    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setQuery('');
        setSelectedIndex(-1);
      }
    }

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isPanelVisible]);

  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const container = listRef.current;
    const items = container.querySelectorAll('li');
    const item = items[selectedIndex];
    if (!item) return;

    const SCROLL_OFFSET = 4; // matches p-1
    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();

    if (itemRect.bottom > containerRect.bottom) {
      container.scrollTop += itemRect.bottom - containerRect.bottom + SCROLL_OFFSET;
    } else if (itemRect.top < containerRect.top) {
      container.scrollTop -= containerRect.top - itemRect.top + SCROLL_OFFSET;
    }
  }, [selectedIndex]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    gsap.killTweensOf(panel);

    function finishClosingPanel() {
      setShouldRender(false);
      setResults([]);
      setError('');
      setStatus('idle');
    }

    if (isPanelVisible) {
      if (prefersReducedMotion()) {
        gsap.set(panel, { autoAlpha: 1, y: 0, scale: 1 });
      } else {
        gsap.fromTo(
          panel,
          { autoAlpha: 0, y: -8, scale: 0.96 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.2,
            ease: 'power2.out',
            overwrite: 'auto',
          },
        );
      }
    } else {
      if (prefersReducedMotion()) {
        gsap.to(panel, {
          autoAlpha: 0,
          duration: 0,
          overwrite: 'auto',
          onComplete: finishClosingPanel,
        });
      } else {
        gsap.to(panel, {
          autoAlpha: 0,
          y: -4,
          scale: 0.98,
          duration: 0.15,
          ease: 'power2.in',
          overwrite: 'auto',
          onComplete: finishClosingPanel,
        });
      }
    }

    return () => {
      gsap.killTweensOf(panel);
    };
  }, [isPanelVisible, shouldRender]);

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

  function handleQueryChange(event) {
    const nextQuery = event.target.value;

    if (nextQuery.trim() !== '') {
      setShouldRender(true);
    }

    setQuery(nextQuery);
    setSelectedIndex(-1);
  }

  return (
    <div ref={containerRef} className="app-no-drag relative w-full max-w-md">
      <label className="sr-only" htmlFor="app-search">
        Search
      </label>
      <InputGroup
        className="h-8 gap-1 border-border bg-transparent px-1 shadow-none"
        data-slot="app-search"
        onKeyDown={(e) => {
          if (!isPanelVisible || displayStatus !== 'ready') return;

          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
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
            setSelectedIndex(-1);
          }
        }}
      >
        <InputGroupAddon className="pl-1.5" align="inline-start">
          <IconSearch aria-hidden="true" className="size-[18px]" data-icon="inline-start" />
        </InputGroupAddon>
        <InputGroupInput
          id="app-search"
          aria-label="Search"
          className="h-auto min-w-0 px-0 py-0"
          data-command-target="search-query"
          name="app-search"
          placeholder="Search"
          type="search"
          value={query}
          onChange={handleQueryChange}
        />
        {query && (
          <InputGroupAddon className="pr-0.5" align="inline-end">
            <InputGroupButton
              aria-label="Clear search"
              size="icon-xs"
              onClick={() => {
                setQuery('');
                setSelectedIndex(-1);
              }}
            >
              <IconX aria-hidden="true" data-icon="inline-start" />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      {shouldRender && (
        <CornerSurface
          ref={panelRef}
          corner="lg"
          dataSlot="search-results"
          className="absolute top-10 left-0 z-[100] w-full bg-overlay text-overlay-foreground shadow-(--shadow-popover) ring-1 ring-border"
        >
          {panelContent}
        </CornerSurface>
      )}
    </div>
  );
}
