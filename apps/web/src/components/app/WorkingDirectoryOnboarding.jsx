import { useState } from 'react';
import { FolderOpen } from '@nine-thirty-five/material-symbols-react/rounded';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { DirectoryPickerResultSchema } from '@/features/settings/schemas.js';

export function WorkingDirectoryOnboarding({ onComplete }) {
  const [step, setStep] = useState('directory');
  const [selectedPath, setSelectedPath] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [error, setError] = useState('');
  const [isChoosing, setIsChoosing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function handleChooseDirectory() {
    if (!window.dao?.selectWorkingDirectory) {
      setError('Directory picker is only available in the desktop app.');
      return;
    }

    try {
      setIsChoosing(true);
      setError('');

      const result = DirectoryPickerResultSchema.parse(await window.dao.selectWorkingDirectory());

      if (!result.canceled) {
        setSelectedPath(result.path);
        setStep('workspace');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to choose directory');
    } finally {
      setIsChoosing(false);
    }
  }

  function handleContinueToWorkspace() {
    if (!selectedPath) {
      setError('Choose a working directory before continuing.');
      return;
    }

    setError('');
    setStep('workspace');
  }

  async function handleCreateWorkspace(event) {
    event.preventDefault();

    if (!selectedPath) {
      setError('Choose a working directory before creating a workspace.');
      setStep('directory');
      return;
    }

    if (workspaceName.trim() === '') {
      setError('Workspace name is required.');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await onComplete({
        path: selectedPath,
        workspace: {
          name: workspaceName,
          description: workspaceDescription,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Step {step === 'directory' ? '1' : '2'} of 2
          </p>
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            {step === 'directory' ? 'Choose a working directory' : 'Create your first workspace'}
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            {step === 'directory'
              ? 'Dao stores workspace folders, project folders, notes, and future imported files in a directory you control.'
              : 'A workspace is the top-level place for your projects, tasks, notes, and future local files.'}
          </p>
        </div>

        {step === 'directory' ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {selectedPath || 'No directory selected'}
            </div>

            {error && <FieldError>{error}</FieldError>}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                disabled={isChoosing || isSaving}
                type="button"
                variant="outline"
                onClick={handleChooseDirectory}
              >
                <FolderOpen data-icon="inline-start" />
                {isChoosing ? 'Choosing...' : 'Choose folder'}
              </Button>
              <Button
                disabled={!selectedPath || isSaving}
                type="button"
                onClick={handleContinueToWorkspace}
              >
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleCreateWorkspace}>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {selectedPath}
            </div>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="onboarding-workspace-name">Workspace name</FieldLabel>
                <Input
                  id="onboarding-workspace-name"
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="Personal"
                  disabled={isSaving}
                  autoFocus
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="onboarding-workspace-description">Description</FieldLabel>
                <Input
                  id="onboarding-workspace-description"
                  value={workspaceDescription}
                  onChange={(event) => setWorkspaceDescription(event.target.value)}
                  placeholder="Optional"
                  disabled={isSaving}
                />
              </Field>
            </FieldGroup>

            {error && <FieldError>{error}</FieldError>}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                disabled={isSaving}
                type="button"
                variant="outline"
                onClick={() => {
                  setError('');
                  setStep('directory');
                }}
              >
                Back
              </Button>
              <Button disabled={isSaving} type="submit">
                {isSaving ? 'Creating...' : 'Create workspace'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
