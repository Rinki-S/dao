import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  FieldError,
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
import Folder01Icon from '@hugeicons/core-free-icons/Folder01Icon';
import FolderOpenIcon from '@hugeicons/core-free-icons/FolderOpenIcon';
import NoteAddIcon from '@hugeicons/core-free-icons/NoteAddIcon';
import { getContentFormatIcon } from '@/extensions/registry.js';
import { notifyActivityChanged, subscribeToActivityChanged } from '@/features/activities/events.js';
import { createNote, listNotes } from '@/features/notes/api.js';
import { createProject, listProjects } from '@/features/projects/api.js';
import { cn } from '@/lib/utils.js';

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
  const [error, setError] = useState('');
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [isContentDialogOpen, setIsContentDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [contentType, setContentType] = useState('note');
  const [contentProjectId, setContentProjectId] = useState('none');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState('general');
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

  const loadTreeData = useCallback(async () => {
    if (!currentWorkspace) {
      setProjects([]);
      setNotes([]);
      setStatus('idle');
      return;
    }

    setStatus('loading');
    setError('');

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
          setError(err instanceof Error ? err.message : 'Failed to load project tree');
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
    setError('');
    setIsContentDialogOpen(true);
  }

  function toggleProject(projectId) {
    onSelectProject(projectId);

    setExpandedProjectIds((currentProjectIds) => {
      const nextProjectIds = new Set(currentProjectIds);

      if (nextProjectIds.has(projectId)) {
        nextProjectIds.delete(projectId);
      } else {
        nextProjectIds.add(projectId);
      }

      return nextProjectIds;
    });
  }

  async function handleCreateProject(event) {
    event.preventDefault();

    if (!currentWorkspace) {
      setError('Create a workspace before adding projects');
      return;
    }

    try {
      setIsCreatingProject(true);
      setError('');

      const createdProject = await createProject({
        workspaceId: currentWorkspace.id,
        name: projectName,
        description: projectDescription,
      });

      setProjectName('');
      setProjectDescription('');
      setIsProjectDialogOpen(false);
      onSelectProject(createdProject.id);
      setExpandedProjectIds((currentProjectIds) => {
        const nextProjectIds = new Set(currentProjectIds);
        nextProjectIds.add(createdProject.id);
        return nextProjectIds;
      });

      await loadTreeData();
      notifyActivityChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setStatus('error');
    } finally {
      setIsCreatingProject(false);
    }
  }

  async function handleCreateContent(event) {
    event.preventDefault();

    if (!currentWorkspace) {
      setError('Create a workspace before adding content');
      return;
    }

    if (contentType !== 'note') {
      setError('Only notes can be created in this milestone');
      return;
    }

    try {
      setIsCreatingContent(true);
      setError('');

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
      onSelectNote(createdNote.id);
      notifyActivityChanged();
      onContentCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create content');
      setStatus('error');
    } finally {
      setIsCreatingContent(false);
    }
  }

  return (
    <section className="relative flex w-full min-w-0 flex-col p-2">
      <div
        className={cn(
          'flex h-8 items-center justify-between gap-2 px-2 text-xs font-medium text-sidebar-foreground/70 transition-[margin,opacity] duration-200 ease-linear',
          !isSidebarOpen && '-mt-8 opacity-0',
        )}
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
              setError('');
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
              <span className="block px-2 py-1 text-xs text-destructive">{error}</span>
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
                  onClick={() => toggleProject(project.id)}
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
                            className={cn(
                              'app-no-drag flex h-7 w-full min-w-0 -translate-x-px transform-gpu items-center justify-start gap-2 overflow-hidden rounded-md px-2 text-sm font-normal text-sidebar-foreground ring-sidebar-ring outline-hidden transition-[background-color,color,scale] duration-[250ms] ease-[var(--ease-smooth)] data-[focus-visible=true]:ring-2 active:scale-[0.96] data-[pressed=true]:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:data-[pressed=true]:scale-100',
                              note.id === selectedNoteId
                                ? 'bg-accent-soft font-medium text-accent-soft-foreground hover:bg-accent-soft-hover hover:text-accent-soft-foreground active:bg-accent-soft-hover active:text-accent-soft-foreground data-[pressed=true]:bg-accent-soft-hover data-[pressed=true]:text-accent-soft-foreground'
                                : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[pressed=true]:bg-sidebar-accent data-[pressed=true]:text-sidebar-accent-foreground',
                            )}
                            type="button"
                            variant="ghost"
                            onPress={() => onSelectNote(note.id)}
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
                    onClick={() => onSelectNote(note.id)}
                  />
                </li>
              );
            })}
        </ul>
      </div>

      <Modal isOpen={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog aria-label="Create project">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>Create project</Modal.Heading>
                <p className="text-sm text-muted-foreground">
                  Add a project to the current workspace.
                </p>
              </Modal.Header>

              <form onSubmit={handleCreateProject}>
                <Modal.Body className="flex flex-col gap-3">
                  <TextField
                    fullWidth
                    isDisabled={!currentWorkspace || isCreatingProject}
                    isRequired
                    name="sidebar-project-name"
                    value={projectName}
                    onChange={setProjectName}
                  >
                    <Label className="sr-only">Project name</Label>
                    <Input placeholder="Project name" variant="secondary" />
                  </TextField>

                  <TextField
                    fullWidth
                    isDisabled={!currentWorkspace || isCreatingProject}
                    name="sidebar-project-description"
                    value={projectDescription}
                    onChange={setProjectDescription}
                  >
                    <Label className="sr-only">Description</Label>
                    <Input placeholder="Description" variant="secondary" />
                  </TextField>

                  {error && <FieldError>{error}</FieldError>}
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
              </form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal isOpen={isContentDialogOpen} onOpenChange={setIsContentDialogOpen}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog aria-label="Create content">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>Create content</Modal.Heading>
                <p className="text-sm text-muted-foreground">
                  Add a note now, with room for integrations later.
                </p>
              </Modal.Header>

              <form onSubmit={handleCreateContent}>
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
                    value={noteTitle}
                    onChange={setNoteTitle}
                  >
                    <Label className="sr-only">Note title</Label>
                    <Input placeholder="Note title" variant="secondary" />
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
                    <Label className="sr-only">Content</Label>
                    <TextArea
                      fullWidth
                      className="min-h-28 resize-y"
                      placeholder="Write a note..."
                      variant="secondary"
                    />
                  </TextField>

                  {error && <FieldError>{error}</FieldError>}
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
              </form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </section>
  );
}

function ProjectTreeButton({ icon: Icon, isActive, isSidebarOpen, label, onClick }) {
  const button = (
    <Button
      className={cn(
        'app-no-drag flex h-8 w-full transform-gpu items-center justify-start gap-2 overflow-hidden rounded-md p-2 text-left text-sm font-normal ring-sidebar-ring outline-hidden transition-[background-color,color,width,height,padding,scale] duration-[250ms] ease-[var(--ease-smooth)] data-[focus-visible=true]:ring-2 active:scale-[0.96] data-[pressed=true]:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:data-[pressed=true]:scale-100',
        !isSidebarOpen && 'size-8 justify-center p-2',
        isActive
          ? 'bg-accent-soft font-medium text-accent-soft-foreground hover:bg-accent-soft-hover hover:text-accent-soft-foreground active:bg-accent-soft-hover active:text-accent-soft-foreground data-[pressed=true]:bg-accent-soft-hover data-[pressed=true]:text-accent-soft-foreground'
          : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[pressed=true]:bg-sidebar-accent data-[pressed=true]:text-sidebar-accent-foreground',
      )}
      type="button"
      variant="ghost"
      onPress={onClick}
    >
      {Array.isArray(Icon) ? (
        <HugeiconsIcon icon={Icon} aria-hidden="true" className="size-[18px] shrink-0" />
      ) : (
        <Icon aria-hidden="true" className="size-[18px] shrink-0" />
      )}
      <span className={cn('truncate', !isSidebarOpen && 'sr-only')}>{label}</span>
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
