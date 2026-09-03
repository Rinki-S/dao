import { IconCheck, IconFilePencil, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button.jsx';
import { cn } from '@/lib/utils';
import { DECISIONS } from '../api.js';
import { fold } from '../diff.js';

// How each kind of line is drawn, and what it is called out loud.
//
// The word matters as much as the colour: a diff read by a screen reader one
// line at a time is a list of sentences with no indication of which ones are
// being taken away, and colour is not something it can pass on.
const OPS = {
  add: { gutter: '+', label: 'Added', className: 'bg-success/12' },
  remove: { gutter: '−', label: 'Removed', className: 'bg-destructive/8' },
  keep: { gutter: ' ', label: '', className: 'text-muted-foreground' },
};

/**
 * What the change would do to the text, line by line.
 *
 * Monospaced and horizontally scrollable rather than wrapped. Whitespace is the
 * thing a model most often gets wrong about a note, and a line that has been
 * re-wrapped to fit is a line whose indentation cannot be checked.
 */
function Diff({ lines }) {
  const folded = fold(lines);

  return (
    <div className="overflow-x-auto border-y font-mono text-xs">
      {folded.map((line, index) =>
        line.op === 'folded' ? (
          <p className="bg-muted/40 px-3 py-1 text-[0.6875rem] text-muted-foreground" key={index}>
            {line.count === 1 ? '1 unchanged line' : `${line.count} unchanged lines`}
          </p>
        ) : (
          <p className={cn('flex gap-2 whitespace-pre px-3', OPS[line.op].className)} key={index}>
            <span aria-hidden="true" className="select-none opacity-48">
              {OPS[line.op].gutter}
            </span>
            {OPS[line.op].label ? <span className="sr-only">{OPS[line.op].label}: </span> : null}
            {/* A line that is empty still needs its row, or a blank line
                between two paragraphs would be shown as nothing at all. */}
            <span>{line.text || ' '}</span>
          </p>
        ),
      )}
    </div>
  );
}

/**
 * What this change is, in words.
 *
 * A kind this build has never heard of still gets a sentence. A newer service
 * proposing something new should leave the reader able to say yes or no to it,
 * not looking at a card that declines to name itself.
 */
function describe({ kind, title }) {
  const name = title || 'an untitled note';

  switch (kind) {
    case 'edit_note':
      return `Change to “${name}”`;
    case 'create_note':
      return `New note “${name}”`;
    case 'edit_tasks':
      return 'Change to your task list';
    case 'rename_note':
      return `Rename “${name}”`;
    case 'delete_note':
      return `Delete “${name}”`;
    default:
      return title ? `Change to “${name}”` : 'A change to your workspace';
  }
}

// What an answered change is called afterwards.
//
// In terms of what the person did, not of what became of the file. Applying can
// still fail — the note may have been edited in between — and the account of
// that comes from the model's next turn, which is the only side that knows. A
// line here claiming the change was written would be this surface guessing, and
// contradicting the reply printed underneath it.
const ANSWERED = {
  applied: { icon: IconCheck, text: 'You applied this change' },
  discarded: { icon: IconX, text: 'You discarded this change' },
};

/**
 * A change the model prepared, waiting for an answer.
 *
 * The card is in the transcript, where it was asked for, rather than in the
 * note editor or a queue somewhere else: the question was asked here and the
 * reason for it is the words just above.
 *
 * It draws `diff`, which the service computed from the same two texts applying
 * will write. Nothing here works out what changed — a second implementation of
 * that is exactly how the picture somebody agreed to stops being the change
 * that happens.
 */
export function ProposalCard({ proposal, busy = false, onDecide }) {
  const answered = ANSWERED[proposal.status];
  const AnsweredIcon = answered?.icon;

  return (
    <section
      aria-label={describe(proposal)}
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-card',
        // An answered change is history. It stays legible and stops competing
        // with the conversation that has moved on past it.
        answered ? 'opacity-72' : null,
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <IconFilePencil aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <h3 className="min-w-0 flex-1 truncate font-medium text-sm">{describe(proposal)}</h3>
      </header>

      {proposal.diff.length > 0 ? (
        <Diff lines={proposal.diff} />
      ) : (
        <p className="border-y px-3 py-2 text-muted-foreground text-xs">
          There is nothing to show for this change.
        </p>
      )}

      {answered ? (
        <p className="flex items-center gap-2 px-3 py-2 text-muted-foreground text-xs">
          <AnsweredIcon aria-hidden="true" className="size-3.5 shrink-0" />
          {answered.text}
        </p>
      ) : (
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <p className="text-muted-foreground text-xs">Nothing has been written yet.</p>
          <div className="flex gap-2">
            {/* Discard first, and it is the plain one. The button that writes to
                somebody's file should not be the one a hand lands on. */}
            <Button
              disabled={busy}
              size="sm"
              variant="outline"
              onClick={() => onDecide?.(proposal, DECISIONS.discard)}
            >
              Discard
            </Button>
            <Button disabled={busy} size="sm" onClick={() => onDecide?.(proposal, DECISIONS.apply)}>
              Apply
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
