import { Button } from '@/components/ui/button';

export function SettingsPanel({ currentWorkingDirectory, onReplayOnboarding }) {
  return (
    <section id="settings" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-semibold text-foreground">Preferences</h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Manage local preferences for this Dao installation.
        </p>
      </div>

      <section className="flex flex-col gap-4 border-t border-border pt-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-foreground">Working directory</h3>
          <p className="text-sm text-muted-foreground text-pretty">
            Dao stores workspace folders, project folders, notes, and imported files here.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {currentWorkingDirectory?.path || 'No working directory configured'}
        </div>

        <div>
          <Button type="button" variant="outline" onClick={onReplayOnboarding}>
            Replay onboarding
          </Button>
        </div>
      </section>
    </section>
  );
}
