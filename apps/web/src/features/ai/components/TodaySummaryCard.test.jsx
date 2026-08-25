import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TodaySummaryCard } from './TodaySummaryCard.jsx';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client.js', () => ({ apiFetch }));

afterEach(() => vi.clearAllMocks());

function summary(overrides = {}) {
  return {
    traceId: 'trace-1',
    date: '2026-08-25',
    summary: {
      headline: 'Reworked the parser recovery path',
      highlights: ['Rewrote error handling', 'Added fixtures'],
      focus: 'Write the release notes',
    },
    included: { notes: 2, notesDropped: 0, tasksIncluded: true, truncated: false },
    ...overrides,
  };
}

function respondWith(body) {
  apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => body });
}

function failWith(status, message = 'nope') {
  apiFetch.mockResolvedValue({ ok: false, status, text: async () => message });
}

async function summarise() {
  render(<TodaySummaryCard workspaceId="workspace-1" onOpenSettings={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Summarise today' }));
}

describe('TodaySummaryCard', () => {
  it('asks nothing until told to', () => {
    render(<TodaySummaryCard workspaceId="workspace-1" onOpenSettings={vi.fn()} />);

    // Sending a workspace to a third party is not something to do on render.
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('shows the summary it was given', async () => {
    respondWith(summary());
    await summarise();

    expect(await screen.findByText('Reworked the parser recovery path')).toBeInTheDocument();
    expect(screen.getByText('Rewrote error handling')).toBeInTheDocument();
    expect(screen.getByText('Write the release notes')).toBeInTheDocument();
  });

  it('says what the summary was drawn from', async () => {
    respondWith(summary());
    await summarise();

    expect(await screen.findByText(/From 2 notes and the task list/)).toBeInTheDocument();
  });

  it('says so when part of the day was left out', async () => {
    // The model cannot know what it was not shown, so it will speak for the
    // whole day regardless. Only the caller can correct that.
    respondWith(
      summary({ included: { notes: 12, notesDropped: 7, tasksIncluded: false, truncated: true } }),
    );
    await summarise();

    expect(await screen.findByText(/7 more left out/)).toBeInTheDocument();
  });

  it.each([
    [428, 'No model connected'],
    [401, 'The provider rejected the API key'],
    [429, 'The provider is rate limiting'],
  ])('turns %i into something to do about it', async (status, expected) => {
    failWith(status);
    await summarise();

    expect(await screen.findByRole('alert')).toHaveTextContent(expected);
  });

  it('offers Settings only for the failures Settings can fix', async () => {
    failWith(428);
    await summarise();
    expect(await screen.findByRole('button', { name: 'Open Settings' })).toBeInTheDocument();

    vi.clearAllMocks();
    failWith(429);
    await userEvent.click(screen.getByRole('button', { name: 'Again' }));
    expect(screen.queryByRole('button', { name: 'Open Settings' })).not.toBeInTheDocument();
  });

  it('treats an empty day as a fact, not a failure', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 204, text: async () => '' });
    await summarise();

    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing to summarise yet');
  });

  it('leaves out a focus the model had none for', async () => {
    respondWith(summary({ summary: { ...summary().summary, focus: '' } }));
    await summarise();

    await screen.findByText('Reworked the parser recovery path');
    expect(screen.queryByText(/^Next: /)).not.toBeInTheDocument();
  });

  it('refuses output that does not match the shape', async () => {
    // The service and the renderer are separate programs. This one should not
    // render whatever the other happens to send.
    respondWith(summary({ summary: { headline: '', highlights: [], focus: '' } }));
    await summarise();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Rewrote error handling')).not.toBeInTheDocument();
  });
});
