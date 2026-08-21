import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx';
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
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Working directory</CardTitle>
                <CardDescription>
                  {model.workingDirectory?.path ?? 'Not configured'}
                </CardDescription>
                <CardAction>
                  <Button size="sm" variant="outline" onClick={onReplayOnboarding}>
                    Change
                  </Button>
                </CardAction>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Local service</CardTitle>
                <CardDescription>
                  {restartStatus === 'ready'
                    ? 'Restarted'
                    : restartStatus === 'error'
                      ? 'Restart failed'
                      : 'Go + SQLite'}
                </CardDescription>
                <CardAction>
                  <Button
                    loading={restartStatus === 'loading'}
                    size="sm"
                    variant="outline"
                    onClick={restart}
                  >
                    Restart
                  </Button>
                </CardAction>
              </CardHeader>
            </Card>
          </div>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Done</DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
