import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getActivityMetrics } from '../api.js';
import { subscribeToActivityChanged } from '../events.js';

const metricItems = [
  { key: 'workspaceCount', label: 'Workspaces' },
  { key: 'projectCount', label: 'Projects' },
  { key: 'taskCount', label: 'Tasks' },
  { key: 'noteCount', label: 'Notes' },
];

export function ActivityMetricsPanel() {
  const [metrics, setMetrics] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setStatus('loading');
        setError('');

        const nextMetrics = await getActivityMetrics();

        if (!cancelled) {
          setMetrics(nextMetrics);
          setStatus('ready');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load progress signals');
          setStatus('error');
        }
      }
    }

    load();

    const unsubscribe = subscribeToActivityChanged(() => {
      load();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <Card id="progress" className="mb-6 max-w-3xl">
      <CardHeader>
        <CardTitle>Progress Signals</CardTitle>
        <CardDescription>
          Local workspace activity summarized into lightweight signals.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {status === 'loading' && (
          <p className="text-sm text-muted-foreground">Loading progress signals...</p>
        )}

        {status === 'error' && <p className="text-sm text-destructive">{error}</p>}

        {status === 'ready' && metrics.totalCount === 0 && (
          <p className="text-sm text-muted-foreground">No progress signals yet.</p>
        )}

        {status === 'ready' && metrics.totalCount > 0 && (
          <div className="grid gap-3 sm:grid-cols-5">
            <MetricValue label="Total" value={metrics.totalCount} />
            {metricItems.map((item) => (
              <MetricValue key={item.key} label={item.label} value={metrics[item.key]} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricValue({ label, value }) {
  return (
    <div className="rounded-md border border-border px-3 py-3">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <span className="mt-2 block font-mono text-2xl font-semibold text-foreground">{value}</span>
    </div>
  );
}
