import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tooltip } from '@heroui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon';
import Folder01Icon from '@hugeicons/core-free-icons/Folder01Icon';
import FolderOpenIcon from '@hugeicons/core-free-icons/FolderOpenIcon';
import NoteAddIcon from '@hugeicons/core-free-icons/NoteAddIcon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
            className="app-no-drag"
            disabled={!currentWorkspace}
            size="icon-xs"
            type="button"
            variant="ghost"
            onClick={() => {
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
            className="app-no-drag"
            disabled={!currentWorkspace}
            size="icon-xs"
            type="button"
            variant="ghost"
            onClick={() => openContentDialog()}
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
                          <button
                            className={cn(
                              'app-no-drag flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sm text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2',
                              note.id === selectedNoteId &&
                                'bg-sidebar-accent text-sidebar-accent-foreground',
                            )}
                            type="button"
                            onClick={() => onSelectNote(note.id)}
                          >
                            <ContentIcon aria-hidden="true" className="size-[18px] shrink-0" />
                            <span className="truncate">{note.title}</span>
                          </button>
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

      <Dialog open={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>Add a project to the current workspace.</DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-3" onSubmit={handleCreateProject}>
            <label className="sr-only" htmlFor="sidebar-project-name">
              Project name
            </label>
            <Input
              id="sidebar-project-name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Project name"
              disabled={!currentWorkspace || isCreatingProject}
            />

            <label className="sr-only" htmlFor="sidebar-project-description">
              Description
            </label>
            <Input
              id="sidebar-project-description"
              value={projectDescription}
              onChange={(event) => setProjectDescription(event.target.value)}
              placeholder="Description"
              disabled={!currentWorkspace || isCreatingProject}
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button disabled={!currentWorkspace || isCreatingProject} type="submit">
                {isCreatingProject ? 'Creating...' : 'Create project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isContentDialogOpen} onOpenChange={setIsContentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create content</DialogTitle>
            <DialogDescription>Add a note now, with room for integrations later.</DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-3" onSubmit={handleCreateContent}>
            <label className="flex flex-col gap-1" htmlFor="sidebar-content-type">
              <span className="text-xs font-medium text-muted-foreground">Content type</span>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger id="sidebar-content-type" className="w-full">
                  <SelectValue placeholder="Select content type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="github" disabled>
                      GitHub integration
                    </SelectItem>
                    <SelectItem value="website" disabled>
                      Website
                    </SelectItem>
                    <SelectItem value="leetcode" disabled>
                      LeetCode
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1" htmlFor="sidebar-content-project">
              <span className="text-xs font-medium text-muted-foreground">Project</span>
              <Select value={contentProjectId} onValueChange={setContentProjectId}>
                <SelectTrigger id="sidebar-content-project" className="w-full">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">No project</SelectItem>
                    {workspaceProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>

            <label className="sr-only" htmlFor="sidebar-note-title">
              Note title
            </label>
            <Input
              id="sidebar-note-title"
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
              placeholder="Note title"
              disabled={!currentWorkspace || isCreatingContent}
            />

            <label className="flex flex-col gap-1" htmlFor="sidebar-note-type">
              <span className="text-xs font-medium text-muted-foreground">Note type</span>
              <Select value={noteType} onValueChange={setNoteType}>
                <SelectTrigger id="sidebar-note-type" className="w-full">
                  <SelectValue placeholder="Select note type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {noteTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>

            <label className="sr-only" htmlFor="sidebar-note-content">
              Content
            </label>
            <Textarea
              id="sidebar-note-content"
              className="min-h-28 resize-y"
              value={noteContent}
              onChange={(event) => setNoteContent(event.target.value)}
              placeholder="Write a note..."
              disabled={!currentWorkspace || isCreatingContent}
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button disabled={!currentWorkspace || isCreatingContent} type="submit">
                {isCreatingContent ? 'Creating...' : 'Create content'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ProjectTreeButton({ icon: Icon, isActive, isSidebarOpen, label, onClick }) {
  const button = (
    <button
      className={cn(
        'app-no-drag flex h-8 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[background-color,color,width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2',
        !isSidebarOpen && 'size-8 justify-center p-2',
        isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
      )}
      type="button"
      onClick={onClick}
    >
      {Array.isArray(Icon) ? (
        <HugeiconsIcon icon={Icon} aria-hidden="true" className="size-[18px] shrink-0" />
      ) : (
        <Icon aria-hidden="true" className="size-[18px] shrink-0" />
      )}
      <span className={cn('truncate', !isSidebarOpen && 'sr-only')}>{label}</span>
    </button>
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
