import { useState } from 'react';
import { IconFolder, IconRefresh } from '@tabler/icons-react';
import { Button } from '@/components/ui/button.jsx';
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog.jsx';
import { waitForAllPendingNoteSaves } from '@/features/notes/note-save-queue.js';

export function SettingsDialog({ model, open, onOpenChange, onReplayOnboarding }) {
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
      <DialogPopup className="dao-corner sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <DialogPanel className="dao-settings-panel">
          <section>
            <p className="dao-settings-label">Storage</p>
            <div className="dao-setting-row">
              <IconFolder aria-hidden="true" />
              <span>
                <strong>Working directory</strong>
                <small>{model.workingDirectory?.path ?? 'Not configured'}</small>
              </span>
              <Button size="sm" variant="outline" onClick={onReplayOnboarding}>
                Change
              </Button>
            </div>
          </section>
          <section>
            <p className="dao-settings-label">Development</p>
            <div className="dao-setting-row">
              <IconRefresh aria-hidden="true" />
              <span>
                <strong>Local service</strong>
                <small>
                  {restartStatus === 'ready'
                    ? 'Restarted'
                    : restartStatus === 'error'
                      ? 'Restart failed'
                      : 'Go + SQLite'}
                </small>
              </span>
              <Button
                disabled={restartStatus === 'loading'}
                size="sm"
                variant="outline"
                onClick={restart}
              >
                {restartStatus === 'loading' ? 'Restarting…' : 'Restart'}
              </Button>
            </div>
          </section>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Done</DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
