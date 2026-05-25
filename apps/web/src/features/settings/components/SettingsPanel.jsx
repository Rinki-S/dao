import { Button } from '@/components/ui/button';

export function SettingsPanel({ currentWorkingDirectory, onReplayOnboarding }) {
  return (
    <section id="settings" className="flex w-full flex-col gap-7">
      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Storage
        </h2>

        <div className="overflow-hidden rounded-xl border border-border bg-background">
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

          <div className="ml-4 border-t border-border" />

          <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-foreground">Replay Onboarding</h3>
              <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
                Reselect the working directory and review workspace setup.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={onReplayOnboarding}>
              Open
            </Button>
          </div>
        </div>
      </section>
    </section>
  );
}
