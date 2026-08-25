import { useState } from 'react';
import { IconAlertTriangle, IconSparkles } from '@tabler/icons-react';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card.jsx';
import { Spinner } from '@/components/ui/spinner.jsx';
import { summarizeToday, SUMMARY_OUTCOMES } from '../api.js';

// What the reader should do about each way this can fail. A single "AI
// failed" would leave them guessing which of these it was.
const OUTCOME_TEXT = {
  [SUMMARY_OUTCOMES.nothingToday]: {
    title: 'Nothing to summarise yet',
    description: 'Nothing in this workspace changed today.',
  },
  [SUMMARY_OUTCOMES.notConfigured]: {
    title: 'No model connected',
    description: 'Add a provider in Settings to summarise your day.',
  },
  [SUMMARY_OUTCOMES.keyRejected]: {
    title: 'The provider rejected the API key',
    description: 'Check the key in Settings.',
  },
  [SUMMARY_OUTCOMES.rateLimited]: {
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

  // A summary drawn from part of a day must say so. The model cannot know
  // what it was not shown, so it will speak for the whole day regardless.
  const dropped =
    included.notesDropped > 0
      ? `, ${included.notesDropped} more left out`
      : included.truncated
        ? ', shortened to fit'
        : '';

  return `From ${parts.join(' and ')}${dropped}.`;
}

/**
 * Summarising today, on the home screen where the day is.
 *
 * Not behind a chat: the flow in docs/ai-harness.md is a button that produces
 * a checked result, and a conversation would promise an ability that does not
 * exist yet.
 */
export function TodaySummaryCard({ workspaceId, onOpenSettings }) {
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [message, setMessage] = useState('');

  async function run() {
    if (!workspaceId) return;

    setStatus('loading');
    setOutcome(null);
    setMessage('');

    try {
      setResult(await summarizeToday(workspaceId));
      setStatus('ready');
    } catch (error) {
      setStatus('failed');
      setOutcome(error.outcome ?? SUMMARY_OUTCOMES.failed);
      setMessage(error.message);
    }
  }

  const text = outcome ? OUTCOME_TEXT[outcome] : null;

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>
          <IconSparkles aria-hidden="true" />
          Today
        </CardTitle>
        <CardDescription>
          {result ? result.date : 'A short account of what this day contained.'}
        </CardDescription>
      </CardHeader>
      <CardPanel>
        {status === 'loading' ? (
          <p
            aria-busy="true"
            className="flex items-center gap-2 text-muted-foreground text-sm"
            role="status"
          >
            <Spinner aria-hidden="true" />
            Reading today…
          </p>
        ) : null}

        {status === 'ready' && result ? (
          <div className="flex flex-col gap-3">
            <p className="font-medium">{result.summary.headline}</p>
            <ul className="flex list-disc flex-col gap-1 ps-4 text-sm">
              {result.summary.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
            {result.summary.focus ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Next: </span>
                {result.summary.focus}
              </p>
            ) : null}
            {coverage(result.included) ? (
              <p className="text-muted-foreground text-xs">{coverage(result.included)}</p>
            ) : null}
          </div>
        ) : null}

        {status === 'failed' ? (
          <div className="flex flex-col gap-2" role="alert">
            <p className="flex items-center gap-1.5 font-medium text-sm">
              <IconAlertTriangle aria-hidden="true" className="size-4 shrink-0" />
              {text?.title ?? 'Could not summarise today'}
            </p>
            <p className="text-muted-foreground text-sm">{text?.description ?? message}</p>
          </div>
        ) : null}
      </CardPanel>
      <CardPanel className="flex justify-end gap-2 border-t pt-4">
        {outcome === SUMMARY_OUTCOMES.notConfigured || outcome === SUMMARY_OUTCOMES.keyRejected ? (
          <Button size="sm" variant="outline" onClick={onOpenSettings}>
            Open Settings
          </Button>
        ) : null}
        <Button disabled={!workspaceId} loading={status === 'loading'} size="sm" onClick={run}>
          {status === 'ready' || status === 'failed' ? 'Again' : 'Summarise today'}
        </Button>
      </CardPanel>
    </Card>
  );
}
