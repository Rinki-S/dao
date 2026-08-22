import { useState } from 'react';
import { IconFolderOpen } from '@tabler/icons-react';
import { Button } from '@/components/ui/button.jsx';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from '@/components/ui/card.jsx';
import { Field, FieldLabel } from '@/components/ui/field.jsx';
import { Input } from '@/components/ui/input.jsx';
import { DirectoryPickerResultSchema } from '@/features/settings/schemas.js';

export function WorkingDirectoryOnboarding({
  initialPath = '',
  hasWorkspace = false,
  onCancel,
  onComplete,
}) {
  const [path, setPath] = useState(initialPath);
  const [workspaceName, setWorkspaceName] = useState(hasWorkspace ? '' : 'Personal');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  async function chooseFolder() {
    if (!window.dao?.selectWorkingDirectory) {
      setError('Choose a folder from the Dao desktop app.');
      return;
    }
    setStatus('choosing');
    try {
      const result = DirectoryPickerResultSchema.parse(await window.dao.selectWorkingDirectory());
      if (!result.canceled) setPath(result.path);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to choose folder');
    } finally {
      setStatus('idle');
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!path || (!hasWorkspace && !workspaceName.trim())) return;
    setStatus('saving');
    setError('');
    try {
      await onComplete({
        path,
        strategy: 'start-fresh',
        workspace: workspaceName.trim() ? { name: workspaceName.trim(), description: '' } : null,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to create workspace');
      setStatus('idle');
    }
  }

  return (
    <main className="app-drag-region grid h-svh place-items-center bg-background p-4">
      <div className="app-no-drag w-full max-w-md">
        <Card render={<form onSubmit={submit} />}>
          <CardHeader>
            <CardTitle>Start your path with Dao.</CardTitle>
            <CardDescription>
              Choose one folder you control. Dao will keep workspaces, project folders, Markdown
              notes, and future formats there.
            </CardDescription>
          </CardHeader>
          <CardPanel>
            <div className="flex flex-col gap-4">
              <Button type="button" variant="outline" onClick={chooseFolder}>
                <IconFolderOpen aria-hidden="true" />
                {path ? 'Change working directory' : 'Choose a folder'}
              </Button>
              <p className="break-all text-muted-foreground text-sm">
                {path || 'Nothing leaves this device by default.'}
              </p>
              {!hasWorkspace ? (
                <Field>
                  <FieldLabel>Workspace name</FieldLabel>
                  <Input
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                  />
                </Field>
              ) : null}
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </CardPanel>
          <CardFooter>
            <div className="flex w-full justify-end gap-2">
              {onCancel ? (
                <Button type="button" variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              ) : null}
              <Button
                loading={status === 'saving'}
                disabled={
                  !path || status === 'choosing' || (!hasWorkspace && !workspaceName.trim())
                }
                type="submit"
              >
                Continue
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
