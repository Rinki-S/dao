import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProposalCard } from './ProposalCard.jsx';

function proposal(overrides = {}) {
  return {
    id: 'proposal-1',
    conversationId: 'chat-1',
    toolCallId: 'call-1',
    kind: 'edit_note',
    targetId: 'note-1',
    title: 'Ports',
    before: 'Listens on 8080.',
    after: 'Listens on 7743.',
    diff: [
      { op: 'remove', text: 'Listens on 8080.' },
      { op: 'add', text: 'Listens on 7743.' },
    ],
    status: 'pending',
    createdAt: '2026-09-02T10:00:00Z',
    ...overrides,
  };
}

describe('ProposalCard', () => {
  it('names the note and shows both sides of the change', async () => {
    render(<ProposalCard proposal={proposal()} />);

    expect(screen.getByRole('heading', { name: 'Change to “Ports”' })).toBeInTheDocument();
    expect(screen.getByText('Listens on 8080.')).toBeInTheDocument();
    expect(screen.getByText('Listens on 7743.')).toBeInTheDocument();
  });

  it('says which line is going and which is arriving, in words', () => {
    // A diff read out one line at a time is a list of sentences with no sign of
    // which are being taken away, and colour is not something a screen reader
    // can pass on.
    render(<ProposalCard proposal={proposal()} />);

    expect(screen.getByText('Removed:')).toBeInTheDocument();
    expect(screen.getByText('Added:')).toBeInTheDocument();
  });

  it('is plain that nothing has happened yet', async () => {
    render(<ProposalCard proposal={proposal()} />);

    expect(screen.getByText('Nothing has been written yet.')).toBeInTheDocument();
  });

  it('reports which decision was pressed', async () => {
    const onDecide = vi.fn();
    render(<ProposalCard proposal={proposal()} onDecide={onDecide} />);

    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ id: 'proposal-1' }), 'apply');

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ id: 'proposal-1' }), 'discard');
  });

  it('offers nothing to press while a turn is running', async () => {
    render(<ProposalCard busy proposal={proposal()} />);

    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
  });

  it('says what the person did, not what became of the file', () => {
    // Applying can still be refused by a note that moved on in between. The
    // account of that comes from the model's next turn, which is the only side
    // that knows — a card claiming the change was written would be guessing,
    // and contradicting the reply printed under it.
    render(<ProposalCard proposal={proposal({ status: 'applied' })} />);

    expect(screen.getByText('You applied this change')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
  });

  it('keeps a discarded change in the transcript', () => {
    // A transcript shows what happened, and a change somebody said no to is as
    // much a part of that as one they agreed to.
    render(<ProposalCard proposal={proposal({ status: 'discarded' })} />);

    expect(screen.getByText('You discarded this change')).toBeInTheDocument();
    expect(screen.getByText('Listens on 8080.')).toBeInTheDocument();
  });

  it('says so when the write was refused', () => {
    // The one thing about the file this surface can state, because the service
    // recorded what the code that tried to write reported. Without it the card
    // would say the change was applied over a reply explaining that it was not.
    render(<ProposalCard proposal={proposal({ status: 'failed' })} />);

    expect(screen.getByText('This change could not be applied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('offers no second answer to a status it has never heard of', () => {
    // A newer service's word for answered is still answered. Fresh buttons here
    // would offer a decision already spent on a call the model has replied to.
    render(<ProposalCard proposal={proposal({ status: 'superseded' })} />);

    expect(screen.getByText('This change was answered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
  });

  it('still asks about a kind it has never heard of', () => {
    // A newer service proposing something new should leave the reader able to
    // say yes or no, not looking at a card that declines to name itself.
    render(<ProposalCard proposal={proposal({ kind: 'edit_calendar', title: '' })} />);

    expect(screen.getByRole('heading', { name: 'A change to your workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });

  it('renders a change with nothing to compare', () => {
    // Not a shape the service sends, but a card that threw on one would take
    // the whole conversation down rather than one row of it.
    render(<ProposalCard proposal={proposal({ kind: 'rename_note', diff: [] })} />);

    expect(screen.getByText('There is nothing to show for this change.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
  });

  it('names the act rather than calling everything Apply', () => {
    // A button says what it is about to do, and it is read before the heading
    // is. "Apply" is fair for a change to some text and poor for losing a note.
    const labels = {
      edit_note: 'Apply',
      edit_tasks: 'Apply',
      create_note: 'Create',
      rename_note: 'Rename',
      delete_note: 'Delete',
    };

    for (const [kind, label] of Object.entries(labels)) {
      const { unmount } = render(<ProposalCard proposal={proposal({ kind })} />);
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      unmount();
    }
  });

  it('does not promise nothing was written when the change is a deletion', () => {
    // The reassurance has to be about the change in hand. "Nothing has been
    // written yet" is no comfort to somebody looking at a note about to go.
    render(<ProposalCard proposal={proposal({ kind: 'delete_note' })} />);

    expect(screen.getByText('Nothing has been deleted yet.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing has been written yet.')).toBeNull();
  });

  it('still offers Discard first on a deletion', () => {
    // The colour marks it as the one change that cannot be undone; it must not
    // also become the button a hand lands on by default.
    render(<ProposalCard proposal={proposal({ kind: 'delete_note' })} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Discard', 'Delete']);
  });
});
