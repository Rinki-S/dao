import { useState } from 'react';
import { IconFolderOpen } from '@tabler/icons-react';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Spinner } from '@/components/ui/spinner.jsx';
import { DirectoryPickerResultSchema } from '@/features/settings/schemas.js';
import { CornerSurface } from '@/lib/corners.jsx';
import { AppApiErrorMessage } from './AppApiErrorMessage.jsx';

const ONBOARDING_STEP_ORDER = {
  directory: 0,
  strategy: 1,
  workspace: 2,
};

function getOnboardingStepProgress(step) {
  return step === 'workspace' ? 'workspace' : 'directory';
}

function SelectedDirectory({ children }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="px-3 py-2 text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
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
  const workspaceNameError =
    !hasWorkspace && workspaceName.trim() === '' && error === 'Workspace name is required.'
      ? error
      : '';
  const workspaceApiError = workspaceNameError ? '' : error;

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
    <div className="relative flex min-h-dvh items-center justify-center bg-background px-6 py-12 pb-28 text-foreground">
      <div className="w-full max-w-xl">
        <div
          key={step}
          data-direction={stepDirection}
          data-step-transition
          className={
            stepDirection !== 'none'
              ? 'animate-in fade-in-0 duration-150 ease-out data-[direction=backward]:slide-in-from-left-4 data-[direction=forward]:slide-in-from-right-4 motion-reduce:animate-none motion-reduce:transition-none'
              : undefined
          }
        >
          <div className="mb-6 flex flex-col gap-2" data-step-header>
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
              <SelectedDirectory>{selectedPath || 'No directory selected'}</SelectedDirectory>

              <AppApiErrorMessage>{error}</AppApiErrorMessage>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  disabled={isChoosing || isSaving}
                  type="button"
                  variant="outline"
                  onClick={handleChooseDirectory}
                >
                  {isChoosing ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <IconFolderOpen aria-hidden="true" data-icon="inline-start" />
                  )}
                  {isChoosing ? 'Choosing...' : 'Choose folder'}
                </Button>
                <Button
                  disabled={!selectedPath || isSaving}
                  type="button"
                  onClick={handleContinueToWorkspace}
                >
                  Continue
                </Button>
                {onCancel && (
                  <Button disabled={isSaving} type="button" variant="ghost" onClick={onCancel}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ) : step === 'strategy' ? (
            <div className="flex flex-col gap-4">
              <SelectedDirectory>{selectedPath}</SelectedDirectory>

              <div className="grid gap-2">
                <Button
                  className="h-auto w-full justify-start border-border p-3 text-left"
                  type="button"
                  variant={directoryStrategy === 'start-fresh' ? 'secondary' : 'outline'}
                  onClick={() => setDirectoryStrategy('start-fresh')}
                >
                  <span className="flex flex-col items-start">
                    <span className="font-medium text-foreground">Start fresh</span>
                    <span className="mt-1 block text-muted-foreground">
                      Use this directory for new workspace and project folders from now on.
                    </span>
                  </span>
                </Button>
                <Button
                  className="h-auto w-full justify-start border-border p-3 text-left"
                  disabled
                  type="button"
                  variant="outline"
                  onClick={() => setDirectoryStrategy('migrate')}
                >
                  <span className="flex flex-col items-start">
                    <span className="font-medium text-foreground">Migrate files</span>
                    <span className="mt-1 block text-muted-foreground">
                      Move existing workspace and project folders to the new directory. Coming soon.
                    </span>
                  </span>
                </Button>
              </div>

              <AppApiErrorMessage>{error}</AppApiErrorMessage>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button disabled={isSaving} type="button" onClick={handleContinueFromStrategy}>
                  Continue
                </Button>
                <Button
                  disabled={isSaving}
                  type="button"
                  variant="ghost"
                  onClick={() => goToStep('directory')}
                >
                  Back
                </Button>
                {onCancel && (
                  <Button disabled={isSaving} type="button" variant="ghost" onClick={onCancel}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleCreateWorkspace}>
              <SelectedDirectory>{selectedPath}</SelectedDirectory>

              {!hasWorkspace && (
                <div className="flex flex-col gap-4">
                  <Field data-invalid={Boolean(workspaceNameError)}>
                    <FieldLabel htmlFor="onboarding-workspace-name">Workspace name</FieldLabel>
                    <Input
                      autoFocus
                      aria-invalid={Boolean(workspaceNameError)}
                      disabled={isSaving}
                      id="onboarding-workspace-name"
                      name="workspaceName"
                      placeholder="Personal"
                      required
                      value={workspaceName}
                      onChange={(event) => setWorkspaceName(event.target.value)}
                    />
                    <FieldError>{workspaceNameError}</FieldError>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="onboarding-workspace-description">Description</FieldLabel>
                    <Input
                      disabled={isSaving}
                      id="onboarding-workspace-description"
                      name="workspaceDescription"
                      placeholder="Optional"
                      value={workspaceDescription}
                      onChange={(event) => setWorkspaceDescription(event.target.value)}
                    />
                  </Field>
                </div>
              )}

              <AppApiErrorMessage>{workspaceApiError}</AppApiErrorMessage>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  disabled={isSaving}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setError('');
                    goToStep('directory');
                  }}
                >
                  Back
                </Button>
                <Button disabled={isSaving} type="submit">
                  {isSaving && <Spinner data-icon="inline-start" />}
                  {isSaving
                    ? hasWorkspace
                      ? 'Saving...'
                      : 'Creating...'
                    : hasWorkspace
                      ? 'Continue'
                      : 'Create workspace'}
                </Button>
                {onCancel && (
                  <Button disabled={isSaving} type="button" variant="ghost" onClick={onCancel}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 flex justify-center px-6 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]"
        data-onboarding-footer
      >
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
              <CornerSurface
                as="span"
                aria-current={isActive ? 'step' : undefined}
                corner="circle"
                dataSlot="onboarding-step"
                className={`flex size-6 items-center justify-center text-xs font-medium tabular-nums transition-[background-color,color,opacity] duration-150 motion-reduce:transition-none ${isActive || isComplete ? 'bg-accent text-accent-foreground' : 'bg-default text-default-foreground opacity-60'}`}
              >
                {index + 1}
              </CornerSurface>
              <span
                className={`text-xs font-medium transition-[color,opacity] duration-150 motion-reduce:transition-none ${isActive ? 'text-foreground' : 'text-muted opacity-70'}`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <CornerSurface
                as="span"
                aria-hidden="true"
                corner="pill"
                dataSlot="onboarding-step-connector"
                className={`h-px w-8 transition-[background-color,opacity] duration-150 motion-reduce:transition-none ${isComplete ? 'bg-accent' : 'bg-border opacity-70'}`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
