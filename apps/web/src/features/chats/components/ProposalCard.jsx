import {
  IconAlertTriangle,
  IconCheck,
  IconCursorText,
  IconFilePencil,
  IconFilePlus,
  IconListCheck,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
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

// What the button says, and what is true until it is pressed.
//
// Per kind, because "Apply" is a fair word for a change to some text and a poor
// one for losing a note: a button says what it is about to do, and a person
// scanning a transcript reads the button before they read the heading. The line
// beside it is the same promise stated for the change in hand — "nothing has
// been written" is no comfort to somebody looking at a deletion.
const ACTIONS = {
  edit_note: { icon: IconFilePencil, confirm: 'Apply', pending: 'Nothing has been written yet.' },
  edit_tasks: { icon: IconListCheck, confirm: 'Apply', pending: 'Nothing has been written yet.' },
  create_note: { icon: IconFilePlus, confirm: 'Create', pending: 'This note does not exist yet.' },
  rename_note: {
    icon: IconCursorText,
    confirm: 'Rename',
    pending: 'The note still has its old name.',
  },
  // The only one with nothing to undo it. It gets the colour that means so,
  // and it is still the second button rather than the first.
  delete_note: {
    icon: IconTrash,
    confirm: 'Delete',
    pending: 'Nothing has been deleted yet.',
    destroys: true,
  },
};

// A kind this build does not know still gets a usable pair of buttons, in the
// vaguest words that are certainly true of it.
const UNKNOWN_ACTION = {
  icon: IconFilePencil,
  confirm: 'Apply',
  pending: 'Nothing has been written yet.',
};

// What an answered change is called afterwards.
//
// Mostly in terms of what the person did rather than what became of the file,
// because those are different claims and this surface can only make the first
// one. The exception is a change that failed, and it is only sayable because the
// service records it: the code that tried to write is the one that knows, and
// now that its answer survives in the row, the card can repeat it instead of
// guessing something that would contradict the reply printed underneath.
const ANSWERED = {
  applied: { icon: IconCheck, text: 'You applied this change' },
  discarded: { icon: IconX, text: 'You discarded this change' },
  failed: { icon: IconAlertTriangle, text: 'This change could not be applied' },
};

// Anything that is not pending has been answered, whether or not this build
// knows the word for it. A status from a newer service falling through to a
// fresh pair of buttons would offer a decision that has already been made and
// spent on a call the model has seen the result of.
const UNRECOGNISED = { icon: IconCheck, text: 'This change was answered' };

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
  const answered =
    proposal.status === 'pending' ? null : (ANSWERED[proposal.status] ?? UNRECOGNISED);
  const AnsweredIcon = answered?.icon;
  const action = ACTIONS[proposal.kind] ?? UNKNOWN_ACTION;
  const KindIcon = action.icon;

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
        <KindIcon
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0',
            // The one card whose icon is not the colour of every other icon on
            // the page, because it is the one change that cannot be taken back.
            action.destroys && !answered ? 'text-destructive' : 'text-muted-foreground',
          )}
        />
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
          <p className="text-muted-foreground text-xs">{action.pending}</p>
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
            <Button
              disabled={busy}
              size="sm"
              variant={action.destroys ? 'destructive' : 'default'}
              onClick={() => onDecide?.(proposal, DECISIONS.apply)}
            >
              {action.confirm}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
