import { useState } from 'react';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconSparkles,
} from '@tabler/icons-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert.jsx';
import { Button } from '@/components/ui/button.jsx';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.jsx';
import { ScrollArea } from '@/components/ui/scroll-area.jsx';
import { Separator } from '@/components/ui/separator.jsx';
import { Spinner } from '@/components/ui/spinner.jsx';
import { useTitlebarInset } from '@/components/shell/use-titlebar-inset.js';
import { cn } from '@/lib/utils';
import { saveSummaryAsNote, summarizeToday, SUMMARY_OUTCOMES } from '../api.js';

// Each way this can fail, with the variant that says what kind of thing it is.
// Nothing is broken when there is no model connected or no work to summarise,
// so neither is an error.
const OUTCOMES = {
  [SUMMARY_OUTCOMES.nothingToday]: {
    variant: 'info',
    icon: IconInfoCircle,
    title: 'Nothing to summarise yet',
    description: 'Nothing in this workspace changed today.',
  },
  [SUMMARY_OUTCOMES.notConfigured]: {
    variant: 'info',
    icon: IconInfoCircle,
    title: 'No model connected',
    description: 'Add a provider in Settings to summarise your day.',
    settings: true,
  },
  [SUMMARY_OUTCOMES.keyRejected]: {
    variant: 'error',
    icon: IconAlertTriangle,
    title: 'The provider rejected the API key',
    description: 'Check the key in Settings.',
    settings: true,
  },
  [SUMMARY_OUTCOMES.rateLimited]: {
    variant: 'warning',
    icon: IconAlertTriangle,
    title: 'The provider is rate limiting',
    description: 'Try again shortly.',
  },
};

function coverage(included) {
  const parts = [];

  if (included.notes > 0) {
    parts.push(`${included.notes} ${included.notes === 1 ? 'note' : 'notes'}`);
  }
  if (included.tasksIncluded) parts.push('the task list');
  if (parts.length === 0) return '';

  // A summary drawn from part of a day must say so. The model cannot know what
  // it was not shown, so it will speak for the whole day regardless.
  const dropped =
    included.notesDropped > 0
      ? `, ${included.notesDropped} more left out`
      : included.truncated
        ? ', shortened to fit'
        : '';

  return `From ${parts.join(' and ')}${dropped}.`;
}

/**
 * Today: a short account of what this day contained.
 *
 * A page rather than a card on another one. The summary is the whole of what
 * this surface is for, so it is the page's content and not something sitting
 * inside a container on it.
 */
export function TodayWorkspace({ model, onOpenSettings }) {
  const titlebarInset = useTitlebarInset();
  const workspaceId = model.currentWorkspace?.id ?? '';
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [message, setMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saved, setSaved] = useState(null);

  async function run() {
    if (!workspaceId) return;

    setStatus('loading');
    setOutcome(null);
    setMessage('');
    // A new run is a new thing to decide about, so the last decision does not
    // carry over.
    setSaveStatus('idle');
    setSaved(null);

    try {
      setResult(await summarizeToday(workspaceId));
      setStatus('ready');
    } catch (error) {
      setStatus('failed');
      setOutcome(error.outcome ?? SUMMARY_OUTCOMES.failed);
      setMessage(error.message);
    }
  }

  // Keeping it is the confirmation step. Only the run's id is sent: the note is
  // written from what the service recorded, so what is saved is what was shown.
  async function keep() {
    if (!result) return;

    setSaveStatus('saving');

    try {
      setSaved(await saveSummaryAsNote(result.traceId));
      setSaveStatus('saved');
    } catch (error) {
      setSaveStatus('failed');
      setMessage(error instanceof Error ? error.message : 'Could not save the note');
    }
  }

  const failure = outcome ? OUTCOMES[outcome] : null;
  const FailureIcon = failure?.icon ?? IconAlertTriangle;
  // The action starts in the empty state, where there is nothing else to look
  // at, and moves to the header once the page has content of its own.
  const hasRun = status !== 'idle';

  return (
    <section aria-label="Today" className="flex h-full min-h-0 flex-col">
      {/* h-12 and px-2 to match the note editor's toolbar: switching between a
          note and this page should not move the line the window sits under. */}
      <header
        className={cn('flex h-12 shrink-0 items-center gap-2 border-b px-2', titlebarInset.padding)}
      >
        <div className={cn(titlebarInset.drag, 'flex min-w-0 flex-1 items-baseline gap-2')}>
          <h1 className="font-heading font-semibold text-sm">Today</h1>
          {result ? (
            <span className="truncate text-muted-foreground text-sm">{result.date}</span>
          ) : null}
        </div>
        {hasRun ? (
          <Button
            disabled={!workspaceId}
            loading={status === 'loading'}
            size="sm"
            variant="outline"
            onClick={run}
          >
            Again
          </Button>
        ) : null}
      </header>

      <ScrollArea className="min-h-0 flex-1" overscrollContain>
        <div className="flex flex-col gap-4 p-4">
          {status === 'idle' ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconSparkles aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Nothing summarised yet</EmptyTitle>
                <EmptyDescription>
                  Dao will read the notes and tasks this day changed, and write a short account of
                  it.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button disabled={!workspaceId} onClick={run}>
                  Summarise today
                </Button>
              </EmptyContent>
            </Empty>
          ) : null}

          {status === 'loading' ? (
            <Empty aria-busy="true" aria-label="Summarising today" role="status">
              <EmptyHeader>
                <EmptyMedia>
                  <Spinner aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Reading today…</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : null}

          {status === 'failed' && failure ? (
            <Alert variant={failure.variant}>
              {/* No aria-hidden: the icon carries the status. */}
              <FailureIcon />
              <AlertTitle>{failure.title}</AlertTitle>
              <AlertDescription>{failure.description}</AlertDescription>
              {failure.settings ? (
                <AlertAction>
                  <Button size="xs" variant="outline" onClick={onOpenSettings}>
                    Open Settings
                  </Button>
                </AlertAction>
              ) : null}
            </Alert>
          ) : null}

          {status === 'failed' && !failure ? (
            <Alert variant="error">
              <IconAlertTriangle />
              <AlertTitle>Could not summarise today</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}

          {status === 'ready' && result ? (
            <>
              <p className="font-medium text-lg">{result.summary.headline}</p>
              <ul className="flex list-disc flex-col gap-1 ps-5">
                {result.summary.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
              {result.summary.focus ? (
                <p>
                  <span className="text-muted-foreground">Next: </span>
                  {result.summary.focus}
                </p>
              ) : null}
              {coverage(result.included) ? (
                <p className="text-muted-foreground text-sm">{coverage(result.included)}</p>
              ) : null}

              {saveStatus === 'saved' && saved ? (
                <Alert variant="success">
                  <IconCircleCheck />
                  <AlertTitle>Kept as a note</AlertTitle>
                  <AlertDescription>{saved.title}</AlertDescription>
                </Alert>
              ) : null}

              {saveStatus === 'failed' ? (
                <Alert variant="error">
                  <IconAlertTriangle />
                  <AlertTitle>Could not keep this summary</AlertTitle>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ) : null}

              {saveStatus !== 'saved' ? (
                <>
                  <Separator />
                  <div className="flex justify-end">
                    <Button
                      loading={saveStatus === 'saving'}
                      size="sm"
                      variant="outline"
                      onClick={keep}
                    >
                      Keep as note
                    </Button>
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </ScrollArea>
    </section>
  );
}
