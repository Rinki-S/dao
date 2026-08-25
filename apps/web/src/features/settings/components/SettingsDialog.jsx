import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog.jsx';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.jsx';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs.jsx';
import { AiProviderSettings } from '@/features/ai/components/AiProviderSettings.jsx';
import { waitForAllPendingNoteSaves } from '@/features/notes/note-save-queue.js';
import { APPEARANCES, APPEARANCE_LABELS } from '@/lib/appearance.js';

const APPEARANCE_OPTIONS = APPEARANCES.map((value) => ({
  label: APPEARANCE_LABELS[value],
  value,
}));

/**
 * One setting: what it is on the left, the control that changes it on the
 * right. Rows stack into a section, separated by hairlines.
 */
function SettingRow({ title, description, children }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="min-w-0">
        <p className="font-medium text-sm">{title}</p>
        {description ? (
          <p className="mt-0.5 truncate text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

export function SettingsDialog({
  appearance,
  model,
  open,
  onAppearanceChange,
  onOpenChange,
  onReplayOnboarding,
}) {
  const [restartStatus, setRestartStatus] = useState('idle');

  async function restart() {
    if (!window.dao?.restartLocalService) return;
    setRestartStatus('loading');
    await waitForAllPendingNoteSaves();
    const result = await window.dao.restartLocalService();
    setRestartStatus(result?.ok ? 'ready' : 'error');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <Tabs className="gap-6" defaultValue="general" orientation="vertical">
            <TabsList className="w-40 shrink-0 self-start" variant="underline">
              <TabsTab value="general">General</TabsTab>
              <TabsTab value="appearance">Appearance</TabsTab>
              <TabsTab value="ai">AI</TabsTab>
              <TabsTab value="advanced">Advanced</TabsTab>
            </TabsList>
            <div className="min-h-56 min-w-0 flex-1">
              <TabsPanel value="general">
                <SettingRow
                  description={model.workingDirectory?.path ?? 'Not configured'}
                  title="Working directory"
                >
                  <Button size="sm" variant="outline" onClick={onReplayOnboarding}>
                    Change
                  </Button>
                </SettingRow>
                <SettingRow
                  description={model.currentWorkspace?.name ?? 'None'}
                  title="Current workspace"
                />
              </TabsPanel>
              <TabsPanel value="appearance">
                <SettingRow description="Light, dark, or whatever macOS is set to." title="Theme">
                  <Select
                    items={APPEARANCE_OPTIONS}
                    value={appearance}
                    onValueChange={onAppearanceChange}
                  >
                    <SelectTrigger aria-label="Theme" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup alignItemWithTrigger={false}>
                      {APPEARANCE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </SettingRow>
              </TabsPanel>
              {/* A hidden panel unmounts, so this reads the current settings
                  each time the tab is opened rather than showing what they
                  were when the dialog was first built. */}
              <TabsPanel value="ai">
                <AiProviderSettings />
              </TabsPanel>
              <TabsPanel value="advanced">
                <SettingRow
                  description={
                    restartStatus === 'ready'
                      ? 'Restarted'
                      : restartStatus === 'error'
                        ? 'Restart failed'
                        : 'Go + SQLite, running on this device only.'
                  }
                  title="Local service"
                >
                  <Button
                    loading={restartStatus === 'loading'}
                    size="sm"
                    variant="outline"
                    onClick={restart}
                  >
                    Restart
                  </Button>
                </SettingRow>
              </TabsPanel>
            </div>
          </Tabs>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
