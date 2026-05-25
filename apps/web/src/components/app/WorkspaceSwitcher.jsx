import { useState } from 'react';
import {
  CaretDownIcon,
  CheckIcon,
  PlusIcon,
  StackIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SidebarMenuButton } from '@/components/ui/sidebar';

export function WorkspaceSwitcher({
  workspaces,
  currentWorkspace,
  isLoading,
  error,
  menuOpen,
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

  async function handleCreateWorkspace(event) {
    event.preventDefault();

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

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            tooltip={currentWorkspace?.name ?? 'Workspace'}
            className="app-no-drag font-heading"
          >
            <span className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <StackIcon aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold tracking-normal">
                {currentWorkspace?.name ?? 'No workspace'}
              </span>
              <span className="truncate text-xs font-normal text-sidebar-foreground/70">
                {isLoading ? 'Loading...' : 'Workspace'}
              </span>
            </span>
            <CaretDownIcon aria-hidden="true" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-64" align="start">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuGroup>
            {workspaces.map((workspace) => (
              <DropdownMenuItem key={workspace.id} onSelect={() => onSelectWorkspace(workspace.id)}>
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                {workspace.id === currentWorkspace?.id && <CheckIcon aria-hidden="true" />}
              </DropdownMenuItem>
            ))}

            {!isLoading && workspaces.length === 0 && (
              <DropdownMenuItem disabled>No workspaces yet</DropdownMenuItem>
            )}
          </DropdownMenuGroup>

          {error && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <WarningCircleIcon aria-hidden="true" />
                <span className="truncate">{error}</span>
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                onCreateDialogOpenChange(true);
              }}
            >
              <PlusIcon aria-hidden="true" />
              <span>Create workspace</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createDialogOpen} onOpenChange={onCreateDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
            <DialogDescription>
              Add a top-level space for projects, tasks, and notes.
            </DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-3" onSubmit={handleCreateWorkspace}>
            <label className="sr-only" htmlFor="workspace-name">
              Workspace name
            </label>
            <Input
              id="workspace-name"
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="Workspace name"
              data-command-target="workspace-name"
              autoFocus
            />

            <label className="sr-only" htmlFor="workspace-description">
              Description
            </label>
            <Input
              id="workspace-description"
              value={workspaceDescription}
              onChange={(event) => setWorkspaceDescription(event.target.value)}
              placeholder="Description"
            />

            {createError && <p className="text-sm text-destructive">{createError}</p>}

            <DialogFooter>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create workspace'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
