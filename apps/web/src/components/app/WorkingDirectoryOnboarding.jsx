import { useState } from 'react';
import { Button, FieldError, Input, Label, Surface, TextField } from '@heroui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import FolderOpenIcon from '@hugeicons/core-free-icons/FolderOpenIcon';
import { DirectoryPickerResultSchema } from '@/features/settings/schemas.js';
import { cn } from '@/lib/utils.js';

const ONBOARDING_STEP_ORDER = {
  directory: 0,
  strategy: 1,
  workspace: 2,
};

function getOnboardingStepProgress(step) {
  return step === 'workspace' ? 'workspace' : 'directory';
}

export function WorkingDirectoryOnboarding({
  hasWorkspace = false,
  initialPath = '',
  mode = 'initial',
  onCancel,
  onComplete,
}) {
  const [step, setStep] = useState('directory');
  const [stepDirection, setStepDirection] = useState('none');
  const [selectedPath, setSelectedPath] = useState(initialPath);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [directoryStrategy, setDirectoryStrategy] = useState('start-fresh');
  const [error, setError] = useState('');
  const [isChoosing, setIsChoosing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  function goToStep(nextStep) {
    const direction =
      ONBOARDING_STEP_ORDER[nextStep] > ONBOARDING_STEP_ORDER[step] ? 'forward' : 'backward';

    setStepDirection(nextStep === step ? 'none' : direction);
    setStep(nextStep);
  }

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
        goToStep(
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
    goToStep(
      mode === 'replay' && initialPath && selectedPath !== initialPath ? 'strategy' : 'workspace',
    );
  }

  function handleContinueFromStrategy() {
    if (directoryStrategy === 'migrate') {
      setError('File migration will be handled by a dedicated migration flow.');
      return;
    }

    setError('');
    goToStep('workspace');
  }

  async function handleCreateWorkspace(event) {
    event.preventDefault();

    if (!selectedPath) {
      setError('Choose a working directory before creating a workspace.');
      goToStep('directory');
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

        <div
          key={step}
          data-direction={stepDirection}
          data-step-transition
          className={cn(
            stepDirection !== 'none' &&
              'animate-in fade-in-0 duration-150 ease-out data-[direction=backward]:slide-in-from-left-4 data-[direction=forward]:slide-in-from-right-4 motion-reduce:animate-none motion-reduce:transition-none',
          )}
        >
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
                  onPress={() => goToStep('directory')}
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
                    goToStep('directory');
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

        <OnboardingStepIndicator currentStep={getOnboardingStepProgress(step)} />
      </div>
    </div>
  );
}

function OnboardingStepIndicator({ currentStep }) {
  const steps = [
    { id: 'directory', label: 'Directory' },
    { id: 'workspace', label: 'Workspace' },
  ];
  const currentIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <nav aria-label="Onboarding progress" className="flex items-center justify-center gap-2">
      {steps.map((step, index) => {
        const isActive = index === currentIndex;
        const isComplete = index < currentIndex;

        return (
          <div key={step.id} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-[background-color,color,opacity] duration-150 motion-reduce:transition-none',
                  isActive || isComplete
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-default text-default-foreground opacity-60',
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  'text-xs font-medium transition-[color,opacity] duration-150 motion-reduce:transition-none',
                  isActive ? 'text-foreground' : 'text-muted opacity-70',
                )}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  'h-px w-8 rounded-full transition-[background-color,opacity] duration-150 motion-reduce:transition-none',
                  isComplete ? 'bg-accent' : 'bg-border opacity-70',
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
