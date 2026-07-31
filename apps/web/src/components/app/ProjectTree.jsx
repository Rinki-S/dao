import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconFilePlus,
  IconFolder,
  IconFolderOpen,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getContentFormatIcon } from '@/extensions/registry.js';
import { notifyActivityChanged, subscribeToActivityChanged } from '@/features/activities/events.js';
import { createNote, deleteNote, listNotes, updateNote } from '@/features/notes/api.js';
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
} from '@/features/projects/api.js';
import { AppApiErrorMessage } from './AppApiErrorMessage.jsx';

export function ProjectTree({
  currentWorkspace,
  selectedProjectId,
  selectedNoteId,
  isSidebarOpen = true,
  onSelectProject,
  onSelectNote,
  onContentCreated,
}) {
  const [projects, setProjects] = useState([]);
  const [notes, setNotes] = useState([]);
  const [expandedProjectIds, setExpandedProjectIds] = useState(() => new Set());
  const [status, setStatus] = useState('idle');
  const [treeError, setTreeError] = useState('');
  const [projectCreateError, setProjectCreateError] = useState('');
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectNameError, setProjectNameError] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [renameTarget, setRenameTarget] = useState(null);
  const [inlineCreate, setInlineCreate] = useState(null);
  const [inlineCreateValue, setInlineCreateValue] = useState('');
  const [inlineCreateError, setInlineCreateError] = useState('');
  const [isInlineCreating, setIsInlineCreating] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameFieldError, setRenameFieldError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteProjectNotes, setDeleteProjectNotes] = useState(false);
  const [treeActionError, setTreeActionError] = useState('');
  const [isTreeActionPending, setIsTreeActionPending] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const workspaceProjects = useMemo(() => {
    if (!currentWorkspace) {
      return [];
    }

    return projects.filter((project) => project.workspaceId === currentWorkspace.id);
  }, [currentWorkspace, projects]);

  const notesByProjectId = useMemo(() => {
    const nextNotesByProjectId = new Map();

    if (!currentWorkspace) {
      return nextNotesByProjectId;
    }

    for (const note of notes) {
      if (note.workspaceId !== currentWorkspace.id || !note.projectId) {
        continue;
      }

      const projectNotes = nextNotesByProjectId.get(note.projectId) ?? [];
      projectNotes.push(note);
      nextNotesByProjectId.set(note.projectId, projectNotes);
    }

    return nextNotesByProjectId;
  }, [currentWorkspace, notes]);

  const unassignedNotes = useMemo(() => {
    if (!currentWorkspace) {
      return [];
    }

    return notes.filter((note) => note.workspaceId === currentWorkspace.id && !note.projectId);
  }, [currentWorkspace, notes]);

  const deleteProjectNoteCount =
    deleteTarget?.type === 'project'
      ? (notesByProjectId.get(deleteTarget.item.id)?.length ?? 0)
      : 0;

  const loadTreeData = useCallback(async () => {
    if (!currentWorkspace) {
      setProjects([]);
      setNotes([]);
      setStatus('idle');
      return;
    }

    setStatus('loading');
    setTreeError('');

    const [nextProjects, nextNotes] = await Promise.all([listProjects(), listNotes()]);

    setProjects(nextProjects);
    setNotes(nextNotes);
    setStatus('ready');
  }, [currentWorkspace]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await loadTreeData();
      } catch (err) {
        if (!cancelled) {
          setTreeError(err instanceof Error ? err.message : 'Failed to load project tree');
          setStatus('error');
        }
      }
    }

    load();

    const unsubscribe = subscribeToActivityChanged(() => {
      void load();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [currentWorkspace, loadTreeData]);

  function openProjectDialog() {
    setProjectName('');
    setProjectNameError('');
    setProjectDescription('');
    setProjectCreateError('');
    setIsProjectDialogOpen(true);
  }

  function startInlineNoteCreate(projectId = selectedProjectId) {
    const targetProjectId = projectId || null;

    setInlineCreate({ type: 'note', projectId: targetProjectId });
    setInlineCreateValue('');
    setInlineCreateError('');

    if (targetProjectId) {
      setExpandedProjectIds((currentProjectIds) => {
        const nextProjectIds = new Set(currentProjectIds);
        nextProjectIds.add(targetProjectId);
        return nextProjectIds;
      });
    }
  }

  function cancelInlineCreate() {
    if (isInlineCreating) {
      return;
    }

    setInlineCreate(null);
    setInlineCreateValue('');
    setInlineCreateError('');
  }

  function toggleProject(project) {
    onSelectProject(project);

    setExpandedProjectIds((currentProjectIds) => {
      const nextProjectIds = new Set(currentProjectIds);

      if (nextProjectIds.has(project.id)) {
        nextProjectIds.delete(project.id);
      } else {
        nextProjectIds.add(project.id);
      }

      return nextProjectIds;
    });
  }

  async function handleCreateProject(event) {
    event.preventDefault();

    if (!currentWorkspace) {
      setProjectCreateError('Create a workspace before adding projects');
      return;
    }

    if (!projectName.trim()) {
      setProjectNameError('Project name is required');
      return;
    }

    try {
      setIsCreatingProject(true);
      setProjectCreateError('');

      const createdProject = await createProject({
        workspaceId: currentWorkspace.id,
        name: projectName,
        description: projectDescription,
      });

      setProjectName('');
      setProjectNameError('');
      setProjectDescription('');
      setIsProjectDialogOpen(false);
      onSelectProject(createdProject);
      setExpandedProjectIds((currentProjectIds) => {
        const nextProjectIds = new Set(currentProjectIds);
        nextProjectIds.add(createdProject.id);
        return nextProjectIds;
      });

      await loadTreeData();
      notifyActivityChanged();
    } catch (err) {
      setProjectCreateError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsCreatingProject(false);
    }
  }

  async function commitInlineNoteCreate() {
    if (!inlineCreate || inlineCreate.type !== 'note') {
      return;
    }

    const title = inlineCreateValue.trim();

    if (!title) {
      cancelInlineCreate();
      return;
    }

    if (!currentWorkspace) {
      setInlineCreateError('Create a workspace before adding notes');
      return;
    }

    try {
      setIsInlineCreating(true);
      setInlineCreateError('');

      const createdNote = await createNote({
        workspaceId: currentWorkspace.id,
        projectId: inlineCreate.projectId,
        title,
        content: '',
        contentType: 'markdown',
        noteType: 'general',
      });

      setInlineCreate(null);
      setInlineCreateValue('');

      await loadTreeData();
      onSelectNote(createdNote);
      notifyActivityChanged();
      onContentCreated?.();
    } catch (err) {
      setInlineCreateError(err instanceof Error ? err.message : 'Failed to create note');
    } finally {
      setIsInlineCreating(false);
    }
  }

  function openRenameDialog(type, item) {
    setRenameTarget({ type, item });
    setRenameValue(type === 'project' ? item.name : item.title);
    setRenameFieldError('');
    setTreeActionError('');
  }

  function openDeleteDialog(type, item) {
    setDeleteTarget({ type, item });
    setDeleteProjectNotes(false);
    setTreeActionError('');
  }

  async function handleRenameSubmit(event) {
    event.preventDefault();
    if (!renameTarget) return;

    const nextValue = renameValue.trim();
    if (!nextValue) {
      setRenameFieldError(
        renameTarget.type === 'project' ? 'Project name is required' : 'Note title is required',
      );
      return;
    }

    try {
      setIsTreeActionPending(true);
      setTreeActionError('');
      if (renameTarget.type === 'project') {
        await updateProject(renameTarget.item.id, { name: nextValue });
      } else {
        await updateNote(renameTarget.item.id, { title: nextValue });
      }
      setRenameTarget(null);
      setRenameValue('');
      setRenameFieldError('');
      await loadTreeData();
      notifyActivityChanged();
    } catch (err) {
      setTreeActionError(err instanceof Error ? err.message : 'Failed to rename item');
    } finally {
      setIsTreeActionPending(false);
    }
  }

  async function handleDeleteSubmit(event) {
    event.preventDefault();
    if (!deleteTarget) return;

    try {
      setIsTreeActionPending(true);
      setTreeActionError('');
      if (deleteTarget.type === 'project') {
        await deleteProject(deleteTarget.item.id, { deleteNotes: deleteProjectNotes });
      } else {
        await deleteNote(deleteTarget.item.id);
      }
      setDeleteTarget(null);
      setDeleteProjectNotes(false);
      await loadTreeData();
      notifyActivityChanged();
    } catch (err) {
      setTreeActionError(err instanceof Error ? err.message : 'Failed to delete item');
    } finally {
      setIsTreeActionPending(false);
    }
  }

  function renderTreeContextMenu(type, item) {
    return (
      <ContextMenuContent className="w-44">
        <ContextMenuGroup>
          <ContextMenuItem
            label="Open"
            onClick={() => {
              if (type === 'project') onSelectProject(item);
              if (type === 'note') onSelectNote(item);
            }}
          >
            Open
          </ContextMenuItem>
          {type === 'project' && (
            <ContextMenuItem label="New note" onClick={() => startInlineNoteCreate(item.id)}>
              <IconFilePlus aria-hidden="true" data-icon="inline-start" />
              New note
            </ContextMenuItem>
          )}
          <ContextMenuItem label="Rename" onClick={() => openRenameDialog(type, item)}>
            <IconPencil aria-hidden="true" data-icon="inline-start" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            label="Delete"
            variant="destructive"
            onClick={() => openDeleteDialog(type, item)}
          >
            <IconTrash aria-hidden="true" data-icon="inline-start" />
            Delete
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    );
  }

  return (
    <TooltipProvider delay={0}>
      <section data-slot="project-tree" className="relative flex w-full min-w-0 flex-col p-2">
        <div
          className={`flex h-8 items-center justify-between gap-2 px-2 text-xs font-medium text-sidebar-foreground/70 transition-[margin,opacity] duration-200 ease-linear ${!isSidebarOpen ? '-mt-8 opacity-0' : ''}`}
        >
          <span>Projects</span>
          <div className="flex items-center gap-1">
            <Button
              aria-label="Create project"
              className="app-no-drag size-7 transform-gpu p-0 motion-colors active:bg-sidebar-accent active:text-sidebar-accent-foreground motion-reduce:transition-none"
              disabled={!currentWorkspace}
              size="icon"
              type="button"
              variant="ghost"
              onClick={openProjectDialog}
            >
              <IconPlus
                aria-hidden="true"
                className="size-[18px] shrink-0 translate-y-px"
                data-icon="inline-start"
              />
            </Button>
            <Button
              aria-label="Create content"
              className="app-no-drag size-7 transform-gpu p-0 motion-colors active:bg-sidebar-accent active:text-sidebar-accent-foreground motion-reduce:transition-none"
              disabled={!currentWorkspace}
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => startInlineNoteCreate()}
            >
              <IconFilePlus
                aria-hidden="true"
                className="size-[18px] shrink-0 translate-y-px"
                data-icon="inline-start"
              />
            </Button>
          </div>
        </div>

        <div className="w-full text-sm">
          <ul className="flex w-full min-w-0 flex-col gap-0">
            {status === 'loading' && (
              <li className="relative">
                <div className="flex flex-col gap-2 px-2 py-1">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-[18px]" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-[18px]" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-[18px]" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                </div>
              </li>
            )}

            {status === 'error' && (
              <li className="relative">
                <AppApiErrorMessage className="block px-2 py-1 text-xs">
                  {treeError}
                </AppApiErrorMessage>
              </li>
            )}

            {status === 'ready' &&
              workspaceProjects.length === 0 &&
              unassignedNotes.length === 0 && (
                <li className="relative">
                  <span className="block px-2 py-1 text-xs text-muted-foreground">No projects</span>
                </li>
              )}

            {workspaceProjects.map((project) => {
              const isExpanded = expandedProjectIds.has(project.id);
              const projectNotes = notesByProjectId.get(project.id) ?? [];
              const ProjectIcon = isExpanded ? IconFolderOpen : IconFolder;

              return (
                <li key={project.id} className="relative">
                  <ContextMenu>
                    <ContextMenuTrigger className="contents">
                      <ProjectTreeButton
                        icon={ProjectIcon}
                        isActive={project.id === selectedProjectId}
                        isSidebarOpen={isSidebarOpen}
                        label={project.name}
                        onClick={() => toggleProject(project)}
                      />
                    </ContextMenuTrigger>
                    {renderTreeContextMenu('project', project)}
                  </ContextMenu>

                  {isExpanded && isSidebarOpen && (
                    <ul className="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5">
                      {projectNotes.length === 0 &&
                        !(
                          inlineCreate?.type === 'note' && inlineCreate.projectId === project.id
                        ) && (
                          <li className="relative">
                            <span className="block px-2 py-1 text-xs text-muted-foreground">
                              No notes
                            </span>
                          </li>
                        )}

                      {projectNotes.map((note) => {
                        const ContentIcon = getContentFormatIcon(note.contentType);

                        return (
                          <li key={note.id} className="relative">
                            <ContextMenu>
                              <ContextMenuTrigger className="contents">
                                <Button
                                  className={`app-no-drag flex h-7 w-full min-w-0 -translate-x-px transform-gpu items-center justify-start gap-2 overflow-hidden px-2 text-sm font-normal text-sidebar-foreground ring-sidebar-ring outline-hidden motion-colors focus-visible:ring-2 motion-reduce:transition-none ${note.id === selectedNoteId ? 'bg-accent-soft font-medium text-accent-soft-foreground hover:bg-accent-soft-hover hover:text-accent-soft-foreground active:bg-accent-soft-hover active:text-accent-soft-foreground' : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground'}`}
                                  type="button"
                                  variant="ghost"
                                  onClick={() => onSelectNote(note)}
                                >
                                  <ContentIcon
                                    aria-hidden="true"
                                    className="size-[18px] shrink-0"
                                    data-icon="inline-start"
                                  />
                                  <span className="truncate">{note.title}</span>
                                </Button>
                              </ContextMenuTrigger>
                              {renderTreeContextMenu('note', note)}
                            </ContextMenu>
                          </li>
                        );
                      })}

                      {inlineCreate?.type === 'note' && inlineCreate.projectId === project.id && (
                        <InlineCreateRow
                          error={inlineCreateError}
                          icon={getContentFormatIcon('markdown')}
                          isCreating={isInlineCreating}
                          placeholder="Note title"
                          value={inlineCreateValue}
                          onCancel={cancelInlineCreate}
                          onChange={setInlineCreateValue}
                          onSubmit={commitInlineNoteCreate}
                        />
                      )}
                    </ul>
                  )}
                </li>
              );
            })}

            {status === 'ready' &&
              unassignedNotes.map((note) => {
                const ContentIcon = getContentFormatIcon(note.contentType);

                return (
                  <li key={note.id} className="relative">
                    <ContextMenu>
                      <ContextMenuTrigger className="contents">
                        <ProjectTreeButton
                          icon={ContentIcon}
                          isActive={note.id === selectedNoteId}
                          isSidebarOpen={isSidebarOpen}
                          label={note.title}
                          onClick={() => onSelectNote(note)}
                        />
                      </ContextMenuTrigger>
                      {renderTreeContextMenu('note', note)}
                    </ContextMenu>
                  </li>
                );
              })}
            {status === 'ready' &&
              inlineCreate?.type === 'note' &&
              inlineCreate.projectId === null && (
                <InlineCreateRow
                  error={inlineCreateError}
                  icon={getContentFormatIcon('markdown')}
                  isCreating={isInlineCreating}
                  placeholder="Note title"
                  value={inlineCreateValue}
                  onCancel={cancelInlineCreate}
                  onChange={setInlineCreateValue}
                  onSubmit={commitInlineNoteCreate}
                />
              )}
          </ul>
        </div>

        <Dialog
          open={Boolean(renameTarget)}
          onOpenChange={(open) => {
            if (!open && !isTreeActionPending) {
              setRenameTarget(null);
              setRenameFieldError('');
              setTreeActionError('');
            }
          }}
        >
          <DialogContent
            aria-label={renameTarget?.type === 'project' ? 'Rename project' : 'Rename note'}
          >
            <DialogHeader>
              <DialogTitle>
                {renameTarget?.type === 'project' ? 'Rename project' : 'Rename note'}
              </DialogTitle>
            </DialogHeader>

            <form className="flex flex-col gap-4" onSubmit={handleRenameSubmit}>
              <FieldGroup>
                <Field data-invalid={Boolean(renameFieldError)}>
                  <FieldLabel htmlFor="sidebar-tree-rename">
                    {renameTarget?.type === 'project' ? 'Name' : 'Title'}
                  </FieldLabel>
                  <Input
                    id="sidebar-tree-rename"
                    aria-describedby={renameFieldError ? 'sidebar-tree-rename-error' : undefined}
                    aria-invalid={Boolean(renameFieldError)}
                    disabled={isTreeActionPending}
                    name="sidebar-tree-rename"
                    required
                    value={renameValue}
                    onChange={(event) => {
                      setRenameValue(event.target.value);
                      setRenameFieldError('');
                    }}
                  />
                  <FieldError id="sidebar-tree-rename-error">{renameFieldError}</FieldError>
                </Field>
              </FieldGroup>

              <AppApiErrorMessage>{treeActionError}</AppApiErrorMessage>

              <DialogFooter>
                <Button disabled={isTreeActionPending} type="submit">
                  {isTreeActionPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
                  {isTreeActionPending ? 'Renaming...' : 'Rename'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => {
            if (!open && !isTreeActionPending) {
              setDeleteTarget(null);
              setDeleteProjectNotes(false);
              setTreeActionError('');
            }
          }}
        >
          <DialogContent
            aria-label={deleteTarget?.type === 'project' ? 'Delete project' : 'Delete note'}
          >
            <DialogHeader>
              <DialogTitle>
                {deleteTarget?.type === 'project' ? 'Delete project' : 'Delete note'}
              </DialogTitle>
              <DialogDescription>
                {deleteTarget?.type === 'project'
                  ? `Delete ${deleteTarget.item.name}? This project contains ${deleteProjectNoteCount} note${deleteProjectNoteCount === 1 ? '' : 's'}.`
                  : deleteTarget
                    ? `Delete ${deleteTarget.item.title}?`
                    : ''}
              </DialogDescription>
            </DialogHeader>

            <form className="flex flex-col gap-4" onSubmit={handleDeleteSubmit}>
              {deleteTarget?.type === 'project' && deleteProjectNoteCount > 0 && (
                <Field orientation="horizontal">
                  <Checkbox
                    id="delete-project-notes"
                    checked={deleteProjectNotes}
                    disabled={isTreeActionPending}
                    onCheckedChange={setDeleteProjectNotes}
                  />
                  <FieldLabel htmlFor="delete-project-notes">
                    Also delete notes in this project
                  </FieldLabel>
                </Field>
              )}

              <AppApiErrorMessage>{treeActionError}</AppApiErrorMessage>

              <DialogFooter>
                <Button disabled={isTreeActionPending} type="submit" variant="destructive">
                  {isTreeActionPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
                  {isTreeActionPending ? 'Deleting...' : 'Delete'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isProjectDialogOpen}
          onOpenChange={(open) => {
            if (!isCreatingProject) {
              setIsProjectDialogOpen(open);
            }
          }}
        >
          <DialogContent aria-label="Create project">
            <DialogHeader>
              <DialogTitle>Create project</DialogTitle>
              <DialogDescription>Add a project to the current workspace.</DialogDescription>
            </DialogHeader>

            <form className="flex flex-col gap-4" onSubmit={handleCreateProject}>
              <FieldGroup>
                <Field data-invalid={Boolean(projectNameError)}>
                  <FieldLabel htmlFor="sidebar-project-name">Project name</FieldLabel>
                  <Input
                    id="sidebar-project-name"
                    aria-describedby={projectNameError ? 'sidebar-project-name-error' : undefined}
                    aria-invalid={Boolean(projectNameError)}
                    disabled={!currentWorkspace || isCreatingProject}
                    name="sidebar-project-name"
                    placeholder="Project name"
                    required
                    value={projectName}
                    onChange={(event) => {
                      setProjectName(event.target.value);
                      setProjectNameError('');
                    }}
                  />
                  <FieldError id="sidebar-project-name-error">{projectNameError}</FieldError>
                </Field>

                <Field>
                  <FieldLabel htmlFor="sidebar-project-description">Description</FieldLabel>
                  <Input
                    id="sidebar-project-description"
                    disabled={!currentWorkspace || isCreatingProject}
                    name="sidebar-project-description"
                    placeholder="Description"
                    value={projectDescription}
                    onChange={(event) => setProjectDescription(event.target.value)}
                  />
                </Field>
              </FieldGroup>

              <AppApiErrorMessage>{projectCreateError}</AppApiErrorMessage>

              <DialogFooter>
                <Button disabled={!currentWorkspace || isCreatingProject} type="submit">
                  {isCreatingProject && <Spinner aria-hidden="true" data-icon="inline-start" />}
                  {isCreatingProject ? 'Creating...' : 'Create project'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>


      </section>
    </TooltipProvider>
  );
}

function InlineCreateRow({
  icon: Icon,
  error,
  isCreating,
  onCancel,
  onChange,
  onSubmit,
  placeholder,
  value,
}) {
  return (
    <li className="relative" data-slot="inline-create-row">
      <form
        className="flex h-7 w-full items-center gap-2 px-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {isCreating ? (
          <Spinner aria-hidden="true" className="size-[18px] shrink-0" data-icon="inline-start" />
        ) : (
          <Icon aria-hidden="true" className="size-[18px] shrink-0" data-icon="inline-start" />
        )}
        <Input
          autoFocus
          corner="sm"
          aria-label={placeholder}
          className="h-6 min-w-0 flex-1 px-1.5 text-sm"
          disabled={isCreating}
          placeholder={placeholder}
          value={value}
          onBlur={onCancel}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
            }
          }}
        />
      </form>
      {error ? (
        <AppApiErrorMessage className="block px-2 py-1 text-xs">{error}</AppApiErrorMessage>
      ) : null}
    </li>
  );
}

function ProjectTreeButton({ icon: Icon, isActive, isSidebarOpen, label, onClick }) {
  const button = (
    <Button
      aria-label={label}
      className={`app-no-drag flex h-8 w-full transform-gpu items-center gap-2 overflow-hidden p-2 text-left text-sm ring-sidebar-ring outline-hidden motion-colors-layout focus-visible:ring-2 motion-reduce:transition-none ${!isSidebarOpen ? 'size-8 justify-center p-2' : 'justify-start'} ${isActive ? 'bg-accent-soft font-medium text-accent-soft-foreground hover:bg-accent-soft-hover hover:text-accent-soft-foreground active:bg-accent-soft-hover active:text-accent-soft-foreground' : 'font-normal hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground'}`}
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      <Icon aria-hidden="true" className="size-[18px] shrink-0" data-icon="inline-start" />
      <span className={`truncate ${!isSidebarOpen ? 'sr-only' : ''}`}>{label}</span>
    </Button>
  );

  if (isSidebarOpen) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
