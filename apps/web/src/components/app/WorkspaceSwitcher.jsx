import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon';
import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import ArrowDown01Icon from '@hugeicons/core-free-icons/ArrowDown01Icon';
import CheckmarkSquare01Icon from '@hugeicons/core-free-icons/CheckmarkSquare01Icon';
import SquareStackIcon from '@hugeicons/core-free-icons/SquareStackIcon';
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
              <HugeiconsIcon
                icon={SquareStackIcon}
                className="size-[18px] shrink-0 translate-y-px"
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold tracking-normal">
                {currentWorkspace?.name ?? 'No workspace'}
              </span>
              <span className="truncate text-xs font-normal text-sidebar-foreground/70">
                {isLoading ? 'Loading...' : 'Workspace'}
              </span>
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className="size-[18px] shrink-0 translate-y-px"
            />
          </SidebarMenuButton>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-64" align="start">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuGroup>
            {workspaces.map((workspace) => (
              <DropdownMenuItem key={workspace.id} onSelect={() => onSelectWorkspace(workspace.id)}>
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                {workspace.id === currentWorkspace?.id && (
                  <HugeiconsIcon
                    icon={CheckmarkSquare01Icon}
                    className="size-[18px] shrink-0 translate-y-px"
                  />
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
              <DropdownMenuItem disabled>
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  className="size-[18px] shrink-0 translate-y-px"
                />
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
              <HugeiconsIcon icon={Add01Icon} className="size-[18px] shrink-0 translate-y-px" />
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
