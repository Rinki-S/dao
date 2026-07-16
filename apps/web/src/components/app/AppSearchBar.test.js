import fs from 'node:fs';
import path from 'node:path';

import { createElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchAll } from '@/features/search/api.js';
import { AppSearchBar } from './AppSearchBar.jsx';

vi.mock('@/features/search/api.js', () => ({
  searchAll: vi.fn(),
}));

const appSearchBarPath = path.resolve(import.meta.dirname, 'AppSearchBar.jsx');

describe('AppSearchBar HeroUI migration boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('uses HeroUI search and result label primitives directly', () => {
    const source = fs.readFileSync(appSearchBarPath, 'utf8');

    expect(source).toContain("from '@heroui/react'");
    expect(source).toContain('SearchField');
    expect(source).toContain('Chip');
    expect(source).not.toContain('@/components/ui/');
  });

  it('keeps the app search command focus target on the input', () => {
    const source = fs.readFileSync(appSearchBarPath, 'utf8');

    expect(source).toContain('data-command-target="search-query"');
    expect(source).toContain('value={query}');
    expect(source).toContain('onChange={handleQueryChange}');
  });

  it('searches as the user types and renders partial-match results', async () => {
    const user = userEvent.setup();

    searchAll.mockResolvedValue([
      {
        entityType: 'note',
        entityId: 'note-1',
        title: 'Dao note',
        snippet: 'partial match result',
      },
    ]);

    render(createElement(AppSearchBar));

    await user.type(screen.getByPlaceholderText('Search'), 'dao');

    expect(screen.getByTestId('search-loading-skeleton')).toBeInTheDocument();

    await waitFor(() => {
      expect(searchAll).toHaveBeenCalledWith({ query: 'dao' });
    });

    expect(await screen.findByText('Dao note')).toBeInTheDocument();
    expect(screen.getByText('partial match result')).toBeInTheDocument();
    expect(screen.getByText('note')).toBeInTheDocument();
  });

  it('closes and cleans up the result panel without animation when motion is reduced', async () => {
    const user = userEvent.setup();

    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    searchAll.mockResolvedValue([]);

    render(createElement(AppSearchBar));

    const input = screen.getByPlaceholderText('Search');
    await user.type(input, 'dao');

    expect(screen.getByTestId('search-loading-skeleton')).toBeInTheDocument();

    await user.clear(input);

    await waitFor(() => {
      expect(screen.queryByTestId('search-loading-skeleton')).not.toBeInTheDocument();
    });
  });
});
