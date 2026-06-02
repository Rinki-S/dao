import { useState } from 'react';
import { Button, Surface } from '@heroui/react';

export function SettingsPanel({ currentWorkingDirectory, onReplayOnboarding }) {
  const [restartStatus, setRestartStatus] = useState('idle');
  const [restartError, setRestartError] = useState('');

  async function handleRestartLocalService() {
    if (!window.dao?.restartLocalService) {
      setRestartStatus('failed');
      setRestartError('Restart is only available in the desktop app.');
      return;
    }

    try {
      setRestartStatus('restarting');
      setRestartError('');

      const result = await window.dao.restartLocalService();

      if (!result?.ok) {
        throw new Error(result?.error || 'Failed to restart Go service');
      }

      setRestartStatus('restarted');
    } catch (err) {
      setRestartStatus('failed');
      setRestartError(err instanceof Error ? err.message : 'Failed to restart Go service');
    }
  }

  return (
    <section id="settings" className="flex w-full flex-col gap-7">
      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Storage
        </h2>

        <Surface className="overflow-hidden rounded-xl border border-border" variant="default">
          <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_minmax(12rem,45%)] items-center gap-4 px-4 py-3">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-foreground">Working Directory</h3>
              <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
                Stores workspace folders, project folders, notes, and imported files.
              </p>
            </div>
            <p className="truncate text-right text-sm text-muted-foreground">
              {currentWorkingDirectory?.path || 'Not configured'}
            </p>
          </div>

          <div className="mx-4 border-t border-border" />

          <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-foreground">Replay Onboarding</h3>
              <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
                Reselect the working directory and review workspace setup.
              </p>
            </div>
            <Button type="button" variant="outline" onPress={onReplayOnboarding}>
              Open
            </Button>
          </div>
        </Surface>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Debug
        </h2>

        <Surface className="overflow-hidden rounded-xl border border-border" variant="default">
          <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-foreground">Restart Go Service</h3>
              <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
                Stop and start the local backend process for development debugging.
              </p>
              {restartStatus === 'restarted' && (
                <p className="mt-1 text-sm text-muted-foreground">Go service restarted.</p>
              )}
              {restartStatus === 'failed' && restartError && (
                <p className="mt-1 text-sm text-destructive">{restartError}</p>
              )}
            </div>
            <Button
              type="button"
              variant="danger"
              isDisabled={restartStatus === 'restarting'}
              onPress={handleRestartLocalService}
            >
              {restartStatus === 'restarting' ? 'Restarting...' : 'Restart'}
            </Button>
          </div>
        </Surface>
      </section>
    </section>
  );
}
