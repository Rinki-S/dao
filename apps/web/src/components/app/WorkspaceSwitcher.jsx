import {
  Button,
  Dropdown,
  FieldError,
  Header,
  Input,
  Label,
  Modal,
  Separator,
  TextField,
  Tooltip,
} from '@heroui/react';
import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon';
import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import ArrowDown01Icon from '@hugeicons/core-free-icons/ArrowDown01Icon';
import CheckmarkSquare01Icon from '@hugeicons/core-free-icons/CheckmarkSquare01Icon';
import SquareStackIcon from '@hugeicons/core-free-icons/SquareStackIcon';
import { cn } from '@/lib/utils.js';

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

  function handleWorkspaceAction(key) {
    const actionKey = String(key);

    if (actionKey === 'create-workspace') {
      onCreateDialogOpenChange(true);
      onMenuOpenChange?.(false);
      return;
    }

    if (actionKey.startsWith('workspace:')) {
      onSelectWorkspace(actionKey.slice('workspace:'.length));
      onMenuOpenChange?.(false);
    }
  }

  return (
    <>
      <Dropdown isOpen={menuOpen} onOpenChange={onMenuOpenChange}>
        <Dropdown.Trigger
          aria-label="Switch workspace"
          className={cn(
            'app-no-drag flex h-12 w-full transform-gpu items-center gap-2 overflow-hidden rounded-md p-2 text-left font-heading text-sm ring-sidebar-ring outline-hidden transition-[transform,scale,background-color,color,width,height,padding] duration-[250ms] ease-[var(--ease-smooth)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[focus-visible=true]:ring-2 active:scale-[0.97] data-[pressed=true]:scale-[0.97] data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:data-[pressed=true]:scale-100',
            menuOpen && 'bg-sidebar-accent text-sidebar-accent-foreground',
            !isSidebarOpen && 'size-8 justify-center p-0',
          )}
        >
          {({ isPressed }) => (
            <>
              <Tooltip delay={0} isDisabled={isSidebarOpen}>
                <span className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <HugeiconsIcon
                    icon={SquareStackIcon}
                    className="size-[18px] shrink-0 translate-y-px"
                  />
                </span>
                <Tooltip.Content placement="right">
                  {currentWorkspace?.name ?? 'Workspace'}
                </Tooltip.Content>
              </Tooltip>
              <span className={cn('flex min-w-0 flex-1 flex-col', !isSidebarOpen && 'sr-only')}>
                <span className="truncate text-sm font-semibold tracking-normal">
                  {currentWorkspace?.name ?? 'No workspace'}
                </span>
                <span className="truncate text-xs font-normal text-sidebar-foreground/70">
                  {isLoading ? 'Loading...' : 'Workspace'}
                </span>
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                className={cn(
                  'size-[18px] shrink-0 translate-y-px transition-transform',
                  (isPressed || menuOpen) && 'rotate-180',
                  !isSidebarOpen && 'hidden',
                )}
              />
            </>
          )}
        </Dropdown.Trigger>

        <Dropdown.Popover className="w-64" placement="bottom start">
          <Dropdown.Menu onAction={handleWorkspaceAction}>
            <Dropdown.Section>
              <Header>Workspaces</Header>
              {workspaces.map((workspace) => (
                <Dropdown.Item
                  id={`workspace:${workspace.id}`}
                  key={workspace.id}
                  textValue={workspace.name}
                >
                  <Label className="min-w-0 flex-1 truncate">{workspace.name}</Label>
                  {workspace.id === currentWorkspace?.id && (
                    <HugeiconsIcon
                      icon={CheckmarkSquare01Icon}
                      className="ms-auto size-[18px] shrink-0 translate-y-px"
                    />
                  )}
                </Dropdown.Item>
              ))}

              {!isLoading && workspaces.length === 0 && (
                <Dropdown.Item id="empty-workspaces" isDisabled textValue="No workspaces yet">
                  <Label>No workspaces yet</Label>
                </Dropdown.Item>
              )}
            </Dropdown.Section>

            {error && (
              <>
                <Separator />
                <Dropdown.Item id="workspace-error" isDisabled textValue={error}>
                  <HugeiconsIcon
                    icon={AlertCircleIcon}
                    className="size-[18px] shrink-0 translate-y-px"
                  />
                  <Label className="truncate">{error}</Label>
                </Dropdown.Item>
              </>
            )}

            <Separator />
            <Dropdown.Item id="create-workspace" textValue="Create workspace">
              <HugeiconsIcon icon={Add01Icon} className="size-[18px] shrink-0 translate-y-px" />
              <Label>Create workspace</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      <Modal isOpen={createDialogOpen} onOpenChange={onCreateDialogOpenChange}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog aria-label="Create workspace">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>Create Workspace</Modal.Heading>
                <p className="text-sm text-muted-foreground">
                  Add a top-level space for projects, tasks, and notes.
                </p>
              </Modal.Header>

              <form onSubmit={handleCreateWorkspace}>
                <Modal.Body className="flex flex-col gap-3">
                  <TextField
                    fullWidth
                    isDisabled={isCreating}
                    isRequired
                    name="workspace-name"
                    value={workspaceName}
                    onChange={setWorkspaceName}
                  >
                    <Label>Workspace name</Label>
                    <Input
                      autoFocus
                      data-command-target="workspace-name"
                      placeholder="Workspace name"
                      variant="secondary"
                    />
                  </TextField>

                  <TextField
                    fullWidth
                    isDisabled={isCreating}
                    name="workspace-description"
                    value={workspaceDescription}
                    onChange={setWorkspaceDescription}
                  >
                    <Label>Description</Label>
                    <Input placeholder="Description" variant="secondary" />
                  </TextField>

                  {createError && <FieldError>{createError}</FieldError>}
                </Modal.Body>

                <Modal.Footer>
                  <Button isDisabled={isCreating} isPending={isCreating} type="submit">
                    {isCreating ? 'Creating...' : 'Create workspace'}
                  </Button>
                </Modal.Footer>
              </form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
