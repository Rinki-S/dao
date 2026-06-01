import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Dropdown,
  FieldError,
  Form,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  TextArea,
  TextField,
  Tooltip,
} from '@heroui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import Edit02Icon from '@hugeicons/core-free-icons/Edit02Icon';
import Folder01Icon from '@hugeicons/core-free-icons/Folder01Icon';
import FolderOpenIcon from '@hugeicons/core-free-icons/FolderOpenIcon';
import NoteAddIcon from '@hugeicons/core-free-icons/NoteAddIcon';
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

const noteTypeOptions = [
  { label: 'General', value: 'general' },
  { label: 'Project', value: 'project' },
  { label: 'Learning', value: 'learning' },
  { label: 'Daily', value: 'daily' },
  { label: 'Interview', value: 'interview' },
];

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
  const [contentCreateError, setContentCreateError] = useState('');
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [isContentDialogOpen, setIsContentDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [contentType, setContentType] = useState('note');
  const [contentProjectId, setContentProjectId] = useState('none');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [treeContextMenu, setTreeContextMenu] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteProjectNotes, setDeleteProjectNotes] = useState(false);
  const [treeActionError, setTreeActionError] = useState('');
  const [isTreeActionPending, setIsTreeActionPending] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isCreatingContent, setIsCreatingContent] = useState(false);

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

  function openContentDialog(projectId = selectedProjectId) {
    setContentProjectId(projectId || 'none');
    setContentType('note');
    setNoteTitle('');
    setNoteContent('');
    setNoteType('general');
    setContentCreateError('');
    setIsContentDialogOpen(true);
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

    try {
      setIsCreatingProject(true);
      setProjectCreateError('');

      const createdProject = await createProject({
        workspaceId: currentWorkspace.id,
        name: projectName,
        description: projectDescription,
      });

      setProjectName('');
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

  async function handleCreateContent(event) {
    event.preventDefault();

    if (!currentWorkspace) {
      setContentCreateError('Create a workspace before adding content');
      return;
    }

    if (contentType !== 'note') {
      setContentCreateError('Only notes can be created in this milestone');
      return;
    }

    try {
      setIsCreatingContent(true);
      setContentCreateError('');

      const createdNote = await createNote({
        workspaceId: currentWorkspace.id,
        projectId: contentProjectId === 'none' ? null : contentProjectId,
        title: noteTitle,
        content: noteContent,
        contentType: 'markdown',
        noteType,
      });

      setNoteTitle('');
      setNoteContent('');
      setNoteType('general');
      setIsContentDialogOpen(false);

      if (contentProjectId !== 'none') {
        setExpandedProjectIds((currentProjectIds) => {
          const nextProjectIds = new Set(currentProjectIds);
          nextProjectIds.add(contentProjectId);
          return nextProjectIds;
        });
      }

      await loadTreeData();
      onSelectNote(createdNote);
      notifyActivityChanged();
      onContentCreated?.();
    } catch (err) {
      setContentCreateError(err instanceof Error ? err.message : 'Failed to create content');
    } finally {
      setIsCreatingContent(false);
    }
  }

  function openTreeContextMenu(event, type, item) {
    event.preventDefault();
    event.stopPropagation();
    setTreeActionError('');

    const treeRoot = event.currentTarget.closest('[data-slot="project-tree"]');
    const treeRect = treeRoot?.getBoundingClientRect();

    setTreeContextMenu({
      x: treeRect ? event.clientX - treeRect.left : event.clientX,
      y: treeRect ? event.clientY - treeRect.top : event.clientY,
      type,
      item,
    });
  }

  function closeTreeContextMenu() {
    setTreeContextMenu(null);
  }

  function openRenameDialog(type, item) {
    closeTreeContextMenu();
    setRenameTarget({ type, item });
    setRenameValue(type === 'project' ? item.name : item.title);
    setTreeActionError('');
  }

  function openDeleteDialog(type, item) {
    closeTreeContextMenu();
    setDeleteTarget({ type, item });
    setDeleteProjectNotes(false);
    setTreeActionError('');
  }

  function handleTreeContextMenuAction(actionKey) {
    if (!treeContextMenu) return;

    const { type, item } = treeContextMenu;

    if (actionKey === 'open') {
      closeTreeContextMenu();
      if (type === 'project') onSelectProject(item);
      if (type === 'note') onSelectNote(item);
      return;
    }

    if (actionKey === 'new-note' && type === 'project') {
      closeTreeContextMenu();
      openContentDialog(item.id);
      return;
    }

    if (actionKey === 'rename') {
      openRenameDialog(type, item);
      return;
    }

    if (actionKey === 'delete') {
      openDeleteDialog(type, item);
    }
  }

  async function handleRenameSubmit(event) {
    event.preventDefault();
    if (!renameTarget) return;

    const nextValue = renameValue.trim();
    if (!nextValue) {
      setTreeActionError(
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

  return (
    <section data-slot="project-tree" className="relative flex w-full min-w-0 flex-col p-2">
      <div
        className={`flex h-8 items-center justify-between gap-2 px-2 text-xs font-medium text-sidebar-foreground/70 transition-[margin,opacity] duration-200 ease-linear ${!isSidebarOpen ? '-mt-8 opacity-0' : ''}`}
      >
        <span>Projects</span>
        <div className="flex items-center gap-1">
          <Button
            aria-label="Create project"
            className="app-no-drag size-7 min-w-0 transform-gpu p-0 transition-[background-color,color,scale] duration-[250ms] ease-[var(--ease-smooth)] active:scale-[0.96] active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[pressed=true]:scale-[0.96] data-[pressed=true]:bg-sidebar-accent data-[pressed=true]:text-sidebar-accent-foreground motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:data-[pressed=true]:scale-100"
            isDisabled={!currentWorkspace}
            isIconOnly
            size="sm"
            type="button"
            variant="ghost"
            onPress={() => {
              setProjectCreateError('');
              setIsProjectDialogOpen(true);
            }}
          >
            <HugeiconsIcon
              icon={Add01Icon}
              aria-hidden="true"
              className="size-[18px] shrink-0 translate-y-px"
            />
          </Button>
          <Button
            aria-label="Create content"
            className="app-no-drag size-7 min-w-0 transform-gpu p-0 transition-[background-color,color,scale] duration-[250ms] ease-[var(--ease-smooth)] active:scale-[0.96] active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[pressed=true]:scale-[0.96] data-[pressed=true]:bg-sidebar-accent data-[pressed=true]:text-sidebar-accent-foreground motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:data-[pressed=true]:scale-100"
            isDisabled={!currentWorkspace}
            isIconOnly
            size="sm"
            type="button"
            variant="ghost"
            onPress={() => openContentDialog()}
          >
            <HugeiconsIcon
              icon={NoteAddIcon}
              aria-hidden="true"
              className="size-[18px] shrink-0 translate-y-px"
            />
          </Button>
        </div>
      </div>
      <div className="w-full text-sm">
        <ul className="flex w-full min-w-0 flex-col gap-0">
          {status === 'loading' && (
            <li className="relative">
              <span className="block px-2 py-1 text-xs text-muted-foreground">Loading...</span>
            </li>
          )}

          {status === 'error' && (
            <li className="relative">
              <AppApiErrorMessage className="block px-2 py-1 text-xs">
                {treeError}
              </AppApiErrorMessage>
            </li>
          )}

          {status === 'ready' && workspaceProjects.length === 0 && unassignedNotes.length === 0 && (
            <li className="relative">
              <span className="block px-2 py-1 text-xs text-muted-foreground">No projects</span>
            </li>
          )}

          {workspaceProjects.map((project) => {
            const isExpanded = expandedProjectIds.has(project.id);
            const projectNotes = notesByProjectId.get(project.id) ?? [];
            const projectIcon = isExpanded ? FolderOpenIcon : Folder01Icon;

            return (
              <li key={project.id} className="relative">
                <ProjectTreeButton
                  icon={projectIcon}
                  isActive={project.id === selectedProjectId}
                  isSidebarOpen={isSidebarOpen}
                  label={project.name}
                  onClick={() => toggleProject(project)}
                  onContextMenu={(event) => openTreeContextMenu(event, 'project', project)}
                />

                {isExpanded && isSidebarOpen && (
                  <ul className="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5">
                    {projectNotes.length === 0 && (
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
                          <Button
                            className={`app-no-drag flex h-7 w-full min-w-0 -translate-x-px transform-gpu items-center justify-start gap-2 overflow-hidden rounded-md px-2 text-sm font-normal text-sidebar-foreground ring-sidebar-ring outline-hidden transition-[background-color,color,scale] duration-[250ms] ease-[var(--ease-smooth)] data-[focus-visible=true]:ring-2 active:scale-[0.96] data-[pressed=true]:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:data-[pressed=true]:scale-100 ${note.id === selectedNoteId ? 'bg-accent-soft font-medium text-accent-soft-foreground hover:bg-accent-soft-hover hover:text-accent-soft-foreground active:bg-accent-soft-hover active:text-accent-soft-foreground data-[pressed=true]:bg-accent-soft-hover data-[pressed=true]:text-accent-soft-foreground' : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[pressed=true]:bg-sidebar-accent data-[pressed=true]:text-sidebar-accent-foreground'}`}
                            type="button"
                            variant="ghost"
                            onContextMenu={(event) => openTreeContextMenu(event, 'note', note)}
                            onPress={() => onSelectNote(note)}
                          >
                            <ContentIcon aria-hidden="true" className="size-[18px] shrink-0" />
                            <span className="truncate">{note.title}</span>
                          </Button>
                        </li>
                      );
                    })}
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
                  <ProjectTreeButton
                    icon={ContentIcon}
                    isActive={note.id === selectedNoteId}
                    isSidebarOpen={isSidebarOpen}
                    label={note.title}
                    onClick={() => onSelectNote(note)}
                    onContextMenu={(event) => openTreeContextMenu(event, 'note', note)}
                  />
                </li>
              );
            })}
        </ul>
      </div>

      <Dropdown
        isOpen={Boolean(treeContextMenu)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeTreeContextMenu();
          }
        }}
      >
        <Button
          aria-label="File tree context menu"
          className="absolute z-50 size-px opacity-0"
          isIconOnly
          style={{
            left: treeContextMenu?.x ?? 0,
            top: treeContextMenu?.y ?? 0,
          }}
          type="button"
          variant="ghost"
        >
          <span className="sr-only">File tree context menu</span>
        </Button>
        <Dropdown.Popover className="w-44" placement="bottom start">
          <Dropdown.Menu aria-label="File tree actions" onAction={handleTreeContextMenuAction}>
            <Dropdown.Item id="open" textValue="Open">
              <Label>Open</Label>
            </Dropdown.Item>
            {treeContextMenu?.type === 'project' && (
              <Dropdown.Item id="new-note" textValue="New note">
                <HugeiconsIcon icon={NoteAddIcon} aria-hidden="true" className="size-4" />
                <Label>New note</Label>
              </Dropdown.Item>
            )}
            <Dropdown.Item id="rename" textValue="Rename">
              <HugeiconsIcon icon={Edit02Icon} aria-hidden="true" className="size-4" />
              <Label>Rename</Label>
            </Dropdown.Item>
            <Dropdown.Item
              id="delete"
              className="hover:bg-danger-soft-hover data-[hovered=true]:bg-danger-soft-hover data-[pressed=true]:bg-danger-soft-hover"
              textValue="Delete"
              variant="danger"
            >
              <HugeiconsIcon
                icon={Delete02Icon}
                aria-hidden="true"
                className="size-4 text-danger"
              />
              <Label>Delete</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      <Modal
        isOpen={Boolean(renameTarget)}
        onOpenChange={(isOpen) => !isOpen && setRenameTarget(null)}
      >
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog
              aria-label={renameTarget?.type === 'project' ? 'Rename project' : 'Rename note'}
            >
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>
                  {renameTarget?.type === 'project' ? 'Rename project' : 'Rename note'}
                </Modal.Heading>
              </Modal.Header>

              <Form validationBehavior="native" onSubmit={handleRenameSubmit}>
                <Modal.Body className="flex flex-col gap-3">
                  <TextField
                    fullWidth
                    isDisabled={isTreeActionPending}
                    isRequired
                    name="sidebar-tree-rename"
                    validate={(value) =>
                      value.trim()
                        ? null
                        : renameTarget?.type === 'project'
                          ? 'Project name is required'
                          : 'Note title is required'
                    }
                    value={renameValue}
                    onChange={setRenameValue}
                  >
                    <Label>{renameTarget?.type === 'project' ? 'Name' : 'Title'}</Label>
                    <Input variant="secondary" />
                    <FieldError />
                  </TextField>

                  <AppApiErrorMessage>{treeActionError}</AppApiErrorMessage>
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    isDisabled={isTreeActionPending}
                    isPending={isTreeActionPending}
                    type="submit"
                  >
                    {isTreeActionPending ? 'Renaming...' : 'Rename'}
                  </Button>
                </Modal.Footer>
              </Form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)}
      >
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog
              aria-label={deleteTarget?.type === 'project' ? 'Delete project' : 'Delete note'}
            >
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>
                  {deleteTarget?.type === 'project' ? 'Delete project' : 'Delete note'}
                </Modal.Heading>
                <p className="text-sm text-muted-foreground text-pretty">
                  {deleteTarget?.type === 'project'
                    ? `Delete ${deleteTarget.item.name}? This project contains ${deleteProjectNoteCount} note${deleteProjectNoteCount === 1 ? '' : 's'}.`
                    : `Delete ${deleteTarget?.item.title}?`}
                </p>
              </Modal.Header>

              <Form validationBehavior="native" onSubmit={handleDeleteSubmit}>
                <Modal.Body className="flex flex-col gap-3">
                  {deleteTarget?.type === 'project' && deleteProjectNoteCount > 0 && (
                    <Checkbox isSelected={deleteProjectNotes} onChange={setDeleteProjectNotes}>
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <Label>Also delete notes in this project</Label>
                    </Checkbox>
                  )}

                  <AppApiErrorMessage>{treeActionError}</AppApiErrorMessage>
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    isDisabled={isTreeActionPending}
                    isPending={isTreeActionPending}
                    type="submit"
                    variant="danger"
                  >
                    {isTreeActionPending ? 'Deleting...' : 'Delete'}
                  </Button>
                </Modal.Footer>
              </Form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal isOpen={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog aria-label="Create project">
              <Modal.CloseTrigger />
              <Modal.Header className="gap-0.5 pb-5">
                <Modal.Heading>Create project</Modal.Heading>
                <p className="text-sm text-muted-foreground">
                  Add a project to the current workspace.
                </p>
              </Modal.Header>

              <Form validationBehavior="native" onSubmit={handleCreateProject}>
                <Modal.Body className="flex flex-col gap-3">
                  <TextField
                    fullWidth
                    isDisabled={!currentWorkspace || isCreatingProject}
                    isRequired
                    name="sidebar-project-name"
                    validate={(value) => (value.trim() ? null : 'Project name is required')}
                    value={projectName}
                    onChange={setProjectName}
                  >
                    <Label>Project name</Label>
                    <Input placeholder="Project name" variant="secondary" />
                    <FieldError />
                  </TextField>

                  <TextField
                    fullWidth
                    isDisabled={!currentWorkspace || isCreatingProject}
                    name="sidebar-project-description"
                    value={projectDescription}
                    onChange={setProjectDescription}
                  >
                    <Label>Description</Label>
                    <Input placeholder="Description" variant="secondary" />
                  </TextField>

                  <AppApiErrorMessage>{projectCreateError}</AppApiErrorMessage>
                </Modal.Body>

                <Modal.Footer>
                  <Button
                    isDisabled={!currentWorkspace || isCreatingProject}
                    isPending={isCreatingProject}
                    type="submit"
                  >
                    {isCreatingProject ? 'Creating...' : 'Create project'}
                  </Button>
                </Modal.Footer>
              </Form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal isOpen={isContentDialogOpen} onOpenChange={setIsContentDialogOpen}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog aria-label="Create content">
              <Modal.CloseTrigger />
              <Modal.Header className="gap-0.5 pb-5">
                <Modal.Heading>Create content</Modal.Heading>
                <p className="text-sm text-muted-foreground">
                  Add a note now, with room for integrations later.
                </p>
              </Modal.Header>

              <Form validationBehavior="native" onSubmit={handleCreateContent}>
                <Modal.Body className="flex flex-col gap-3">
                  <Select
                    fullWidth
                    disabledKeys={['github', 'website', 'leetcode']}
                    selectedKey={contentType}
                    variant="secondary"
                    onSelectionChange={(key) => setContentType(String(key ?? 'note'))}
                  >
                    <Label>Content type</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id="note" textValue="Note">
                          Note
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="github" textValue="GitHub integration">
                          GitHub integration
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="website" textValue="Website">
                          Website
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="leetcode" textValue="LeetCode">
                          LeetCode
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      </ListBox>
                    </Select.Popover>
                  </Select>

                  <Select
                    fullWidth
                    selectedKey={contentProjectId}
                    variant="secondary"
                    onSelectionChange={(key) => setContentProjectId(String(key ?? 'none'))}
                  >
                    <Label>Project</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id="none" textValue="No project">
                          No project
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        {workspaceProjects.map((project) => (
                          <ListBox.Item key={project.id} id={project.id} textValue={project.name}>
                            {project.name}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>

                  <TextField
                    fullWidth
                    isDisabled={!currentWorkspace || isCreatingContent}
                    isRequired
                    name="sidebar-note-title"
                    validate={(value) => (value.trim() ? null : 'Note title is required')}
                    value={noteTitle}
                    onChange={setNoteTitle}
                  >
                    <Label>Note title</Label>
                    <Input placeholder="Note title" variant="secondary" />
                    <FieldError />
                  </TextField>

                  <Select
                    fullWidth
                    selectedKey={noteType}
                    variant="secondary"
                    onSelectionChange={(key) => setNoteType(String(key ?? 'general'))}
                  >
                    <Label>Note type</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {noteTypeOptions.map((option) => (
                          <ListBox.Item
                            key={option.value}
                            id={option.value}
                            textValue={option.label}
                          >
                            {option.label}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>

                  <TextField
                    fullWidth
                    isDisabled={!currentWorkspace || isCreatingContent}
                    name="sidebar-note-content"
                    value={noteContent}
                    onChange={setNoteContent}
                  >
                    <Label>Content</Label>
                    <TextArea
                      fullWidth
                      className="min-h-28 resize-y"
                      placeholder="Write a note..."
                      variant="secondary"
                    />
                  </TextField>

                  <AppApiErrorMessage>{contentCreateError}</AppApiErrorMessage>
                </Modal.Body>

                <Modal.Footer>
                  <Button
                    isDisabled={!currentWorkspace || isCreatingContent}
                    isPending={isCreatingContent}
                    type="submit"
                  >
                    {isCreatingContent ? 'Creating...' : 'Create content'}
                  </Button>
                </Modal.Footer>
              </Form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </section>
  );
}

function ProjectTreeButton({ icon: Icon, isActive, isSidebarOpen, label, onClick, onContextMenu }) {
  const button = (
    <Button
      className={`app-no-drag flex h-8 w-full transform-gpu items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[background-color,color,width,height,padding,scale] duration-[250ms] ease-[var(--ease-smooth)] data-[focus-visible=true]:ring-2 active:scale-[0.96] data-[pressed=true]:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:data-[pressed=true]:scale-100 ${!isSidebarOpen ? 'size-8 justify-center p-2' : 'justify-start'} ${isActive ? 'bg-accent-soft font-medium text-accent-soft-foreground hover:bg-accent-soft-hover hover:text-accent-soft-foreground active:bg-accent-soft-hover active:text-accent-soft-foreground data-[pressed=true]:bg-accent-soft-hover data-[pressed=true]:text-accent-soft-foreground' : 'font-normal hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[pressed=true]:bg-sidebar-accent data-[pressed=true]:text-sidebar-accent-foreground'}`}
      type="button"
      variant="ghost"
      onContextMenu={onContextMenu}
      onPress={onClick}
    >
      {Array.isArray(Icon) ? (
        <HugeiconsIcon icon={Icon} aria-hidden="true" className="size-[18px] shrink-0" />
      ) : (
        <Icon aria-hidden="true" className="size-[18px] shrink-0" />
      )}
      <span className={`truncate ${!isSidebarOpen ? 'sr-only' : ''}`}>{label}</span>
    </Button>
  );

  if (isSidebarOpen) {
    return button;
  }

  return (
    <Tooltip delay={0}>
      {button}
      <Tooltip.Content placement="right">{label}</Tooltip.Content>
    </Tooltip>
  );
}
