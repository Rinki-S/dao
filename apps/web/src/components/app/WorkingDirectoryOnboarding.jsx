import { useState } from 'react';
import { Button, FieldError, Input, Label, Surface, TextField } from '@heroui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import FolderOpenIcon from '@hugeicons/core-free-icons/FolderOpenIcon';
import { DirectoryPickerResultSchema } from '@/features/settings/schemas.js';

export function WorkingDirectoryOnboarding({
  hasWorkspace = false,
  initialPath = '',
  mode = 'initial',
  onCancel,
  onComplete,
}) {
  const [step, setStep] = useState('directory');
  const [selectedPath, setSelectedPath] = useState(initialPath);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [directoryStrategy, setDirectoryStrategy] = useState('start-fresh');
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
        setStep(
          mode === 'replay' && initialPath && result.path !== initialPath
            ? 'strategy'
            : 'workspace',
        );
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
    setStep(
      mode === 'replay' && initialPath && selectedPath !== initialPath ? 'strategy' : 'workspace',
    );
  }

  function handleContinueFromStrategy() {
    if (directoryStrategy === 'migrate') {
      setError('File migration will be handled by a dedicated migration flow.');
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

    if (!hasWorkspace && workspaceName.trim() === '') {
      setError('Workspace name is required.');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await onComplete({
        path: selectedPath,
        strategy: directoryStrategy,
        workspace: workspaceName.trim()
          ? {
              name: workspaceName,
              description: workspaceDescription,
            }
          : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {mode === 'replay'
              ? 'Working directory setup'
              : `Step ${step === 'directory' ? '1' : '2'} of 2`}
          </p>
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            {step === 'directory'
              ? 'Choose a working directory'
              : step === 'strategy'
                ? 'Choose how to use this directory'
                : hasWorkspace
                  ? 'Workspace setup'
                  : 'Create your first workspace'}
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            {step === 'directory'
              ? 'Dao stores workspace folders, project folders, notes, and future imported files in a directory you control.'
              : step === 'strategy'
                ? 'Changing the working directory can either start fresh or migrate existing files later.'
                : hasWorkspace
                  ? 'You already have a workspace. You can continue without creating another one.'
                  : 'A workspace is the top-level place for your projects, tasks, notes, and future local files.'}
          </p>
        </div>

        {step === 'directory' ? (
          <div className="flex flex-col gap-4">
            <Surface
              className="rounded-xl border border-border px-3 py-2 text-sm text-muted"
              variant="default"
            >
              {selectedPath || 'No directory selected'}
            </Surface>

            {error && <FieldError>{error}</FieldError>}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                isDisabled={isChoosing || isSaving}
                isPending={isChoosing}
                type="button"
                variant="outline"
                onPress={handleChooseDirectory}
              >
                <HugeiconsIcon icon={FolderOpenIcon} data-icon="inline-start" />
                {isChoosing ? 'Choosing...' : 'Choose folder'}
              </Button>
              <Button
                isDisabled={!selectedPath || isSaving}
                type="button"
                onPress={handleContinueToWorkspace}
              >
                Continue
              </Button>
              {onCancel && (
                <Button isDisabled={isSaving} type="button" variant="ghost" onPress={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : step === 'strategy' ? (
          <div className="flex flex-col gap-4">
            <Surface
              className="rounded-xl border border-border px-3 py-2 text-sm text-muted"
              variant="default"
            >
              {selectedPath}
            </Surface>

            <div className="grid gap-2">
              <Button
                className="h-auto justify-start rounded-xl border-border p-3 text-left"
                fullWidth
                type="button"
                variant={directoryStrategy === 'start-fresh' ? 'secondary' : 'outline'}
                onPress={() => setDirectoryStrategy('start-fresh')}
              >
                <span className="flex flex-col items-start">
                  <span className="font-medium text-foreground">Start fresh</span>
                  <span className="mt-1 block text-muted">
                    Use this directory for new workspace and project folders from now on.
                  </span>
                </span>
              </Button>
              <Button
                className="h-auto justify-start rounded-xl border-border p-3 text-left"
                fullWidth
                isDisabled
                type="button"
                variant="outline"
                onPress={() => setDirectoryStrategy('migrate')}
              >
                <span className="flex flex-col items-start">
                  <span className="font-medium text-foreground">Migrate files</span>
                  <span className="mt-1 block text-muted">
                    Move existing workspace and project folders to the new directory. Coming soon.
                  </span>
                </span>
              </Button>
            </div>

            {error && <FieldError>{error}</FieldError>}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button isDisabled={isSaving} type="button" onPress={handleContinueFromStrategy}>
                Continue
              </Button>
              <Button
                isDisabled={isSaving}
                type="button"
                variant="ghost"
                onPress={() => setStep('directory')}
              >
                Back
              </Button>
              {onCancel && (
                <Button isDisabled={isSaving} type="button" variant="ghost" onPress={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleCreateWorkspace}>
            <Surface
              className="rounded-xl border border-border px-3 py-2 text-sm text-muted"
              variant="default"
            >
              {selectedPath}
            </Surface>

            {!hasWorkspace && (
              <div className="flex flex-col gap-4">
                <TextField
                  isDisabled={isSaving}
                  isInvalid={Boolean(error && workspaceName.trim() === '')}
                  isRequired
                  name="workspaceName"
                  value={workspaceName}
                  onChange={setWorkspaceName}
                >
                  <Label htmlFor="onboarding-workspace-name">Workspace name</Label>
                  <Input
                    autoFocus
                    fullWidth
                    id="onboarding-workspace-name"
                    placeholder="Personal"
                    variant="secondary"
                  />
                </TextField>
                <TextField
                  isDisabled={isSaving}
                  name="workspaceDescription"
                  value={workspaceDescription}
                  onChange={setWorkspaceDescription}
                >
                  <Label htmlFor="onboarding-workspace-description">Description</Label>
                  <Input
                    fullWidth
                    id="onboarding-workspace-description"
                    placeholder="Optional"
                    variant="secondary"
                  />
                </TextField>
              </div>
            )}

            {error && <FieldError>{error}</FieldError>}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                isDisabled={isSaving}
                type="button"
                variant="outline"
                onPress={() => {
                  setError('');
                  setStep('directory');
                }}
              >
                Back
              </Button>
              <Button isDisabled={isSaving} isPending={isSaving} type="submit">
                {isSaving
                  ? hasWorkspace
                    ? 'Saving...'
                    : 'Creating...'
                  : hasWorkspace
                    ? 'Continue'
                    : 'Create workspace'}
              </Button>
              {onCancel && (
                <Button isDisabled={isSaving} type="button" variant="ghost" onPress={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
