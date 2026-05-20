import { useState } from 'react';
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
    <section className="mt-6 max-w-3xl rounded-lg border border-[#E5E7EB] bg-white p-5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-[#111827]">Search</h2>
        <p className="mt-1 text-sm text-[#6B7280]">
          Search across projects, tasks, and notes created after the search index was added.
        </p>
      </div>

      <form className="mb-5 flex flex-col gap-3 sm:flex-row" onSubmit={handleSearch}>
        <input
          className="min-w-0 flex-1 rounded-md border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#00A86B] focus:ring-3 focus:ring-[rgba(0,168,107,0.18)]"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects, tasks, and notes"
        />

        <button
          className="w-fit rounded-md bg-[#00A86B] px-4 py-2 text-sm font-medium text-white hover:bg-[#34C38F] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={status === 'loading'}
          type="submit"
        >
          {status === 'loading' ? 'Searching...' : 'Search'}
        </button>
      </form>

      {status === 'idle' && (
        <p className="text-sm text-[#6B7280]">Enter a keyword to search local Dao data.</p>
      )}

      {status === 'error' && <p className="text-sm text-red-600">{error}</p>}

      {status === 'ready' && results.length === 0 && (
        <p className="text-sm text-[#6B7280]">No results found.</p>
      )}

      {status === 'ready' && results.length > 0 && (
        <ul className="grid gap-2">
          {results.map((result) => (
            <li
              key={`${result.entityType}:${result.entityId}`}
              className="rounded-md border border-[#E5E7EB] px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong className="block text-sm font-medium text-[#111827]">
                    {result.title}
                  </strong>
                  <span className="mt-1 block text-sm text-[#6B7280]">
                    {result.snippet || 'No snippet'}
                  </span>
                  <span className="mt-2 block text-xs text-[#9CA3AF]">
                    workspace {result.workspaceId}
                    {result.projectId ? ` / project ${result.projectId}` : ''}
                  </span>
                </div>

                <span className="rounded-md bg-[#F2EFE8] px-2 py-1 text-xs text-[#6B7280]">
                  {result.entityType}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
