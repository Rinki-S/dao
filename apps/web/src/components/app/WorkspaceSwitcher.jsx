import { useState } from 'react';
import {
  IconAlertCircle,
  IconChevronDown,
  IconPlus,
  IconSquareCheck,
  IconStack2,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button.jsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.jsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.jsx';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Spinner } from '@/components/ui/spinner.jsx';
import { CornerSurface } from '@/lib/corners.jsx';
import { AppApiErrorMessage } from './AppApiErrorMessage.jsx';

export function WorkspaceSwitcher({
  workspaces,
  currentWorkspace,
  isLoading,
  error,
  menuOpen,
  isSidebarOpen = true,
  onMenuOpenChange,
  createDialogOpen,
  onCreateDialogOpenChange,
  onSelectWorkspace,
  onCreateWorkspace,
}) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const workspaceNameError =
    workspaceName.trim() === '' && createError === 'Workspace name is required' ? createError : '';
  const workspaceApiError = workspaceNameError ? '' : createError;

  async function handleCreateWorkspace(event) {
    event.preventDefault();

    if (!workspaceName.trim()) {
      setCreateError('Workspace name is required');
      return;
    }

    try {
      setIsCreating(true);
      setCreateError('');

      await onCreateWorkspace({
        name: workspaceName,
        description: workspaceDescription,
      });

      setWorkspaceName('');
      setWorkspaceDescription('');
      onCreateDialogOpenChange(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setIsCreating(false);
    }
  }

  function selectWorkspace(workspaceId) {
    onSelectWorkspace(workspaceId);
    onMenuOpenChange?.(false);
  }

  function openCreateWorkspaceDialog() {
    setCreateError('');
    onCreateDialogOpenChange(true);
    onMenuOpenChange?.(false);
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Switch workspace"
              className={`app-no-drag h-12 w-full transform-gpu justify-start gap-2 overflow-hidden p-2 text-left font-heading text-sm ring-sidebar-ring motion-colors-layout hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:scale-[0.97] data-pressed:scale-[0.97] data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:data-pressed:scale-100 ${menuOpen ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''} ${!isSidebarOpen ? 'size-8 justify-center p-0' : ''}`}
              title={!isSidebarOpen ? (currentWorkspace?.name ?? 'Workspace') : undefined}
              type="button"
              variant="ghost"
            />
          }
        >
          <CornerSurface
            as="span"
            corner="md"
            dataSlot="workspace-mark"
            className="flex aspect-square size-8 items-center justify-center bg-sidebar-primary text-sidebar-primary-foreground"
          >
            <IconStack2
              aria-hidden="true"
              className="size-[18px] shrink-0 translate-y-px"
              data-icon="inline-start"
            />
          </CornerSurface>
          <span className={`flex min-w-0 flex-1 flex-col ${!isSidebarOpen ? 'sr-only' : ''}`}>
            <span className="truncate text-sm font-semibold tracking-normal">
              {currentWorkspace?.name ?? 'No workspace'}
            </span>
            <span className="truncate text-xs font-normal text-sidebar-foreground/70">
              {isLoading ? <Skeleton className="h-3 w-16" /> : 'Workspace'}
            </span>
          </span>
          <IconChevronDown
            aria-hidden="true"
            className={`size-[18px] shrink-0 translate-y-px transition-transform ${menuOpen ? 'rotate-180' : ''} ${!isSidebarOpen ? 'hidden' : ''}`}
            data-icon="inline-end"
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {workspaces.map((workspace) => (
              <DropdownMenuItem key={workspace.id} onClick={() => selectWorkspace(workspace.id)}>
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                {workspace.id === currentWorkspace?.id && (
                  <IconSquareCheck aria-hidden="true" className="ms-auto" data-icon="inline-end" />
                )}
              </DropdownMenuItem>
            ))}

            {!isLoading && workspaces.length === 0 && (
              <DropdownMenuItem disabled>No workspaces yet</DropdownMenuItem>
            )}
          </DropdownMenuGroup>

          {error && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem disabled>
                  <IconAlertCircle aria-hidden="true" data-icon="inline-start" />
                  <span className="truncate">{error}</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={openCreateWorkspaceDialog}>
              <IconPlus aria-hidden="true" data-icon="inline-start" />
              <span>Create workspace</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createDialogOpen} onOpenChange={onCreateDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Add a top-level space for projects, tasks, and notes.
            </DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-4" onSubmit={handleCreateWorkspace}>
            <FieldGroup>
              <Field data-invalid={Boolean(workspaceNameError)}>
                <FieldLabel htmlFor="workspace-name">Workspace name</FieldLabel>
                <Input
                  id="workspace-name"
                  aria-invalid={Boolean(workspaceNameError)}
                  autoFocus
                  data-command-target="workspace-name"
                  disabled={isCreating}
                  name="workspace-name"
                  placeholder="Workspace name"
                  required
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                />
                <FieldError>{workspaceNameError}</FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="workspace-description">Description</FieldLabel>
                <Input
                  id="workspace-description"
                  disabled={isCreating}
                  name="workspace-description"
                  placeholder="Description"
                  value={workspaceDescription}
                  onChange={(event) => setWorkspaceDescription(event.target.value)}
                />
              </Field>

              <AppApiErrorMessage>{workspaceApiError}</AppApiErrorMessage>
            </FieldGroup>

            <DialogFooter>
              <Button disabled={isCreating} type="submit">
                {isCreating && <Spinner data-icon="inline-start" />}
                {isCreating ? 'Creating...' : 'Create workspace'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
