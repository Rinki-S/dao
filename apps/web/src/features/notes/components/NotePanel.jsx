import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { notifyActivityChanged } from '../../activities/events.js';
import { listProjects } from '../../projects/api.js';
import { createNote, listNotes } from '../api.js';

const noteTypeOptions = [
  { label: 'General', value: 'general' },
  { label: 'Project', value: 'project' },
  { label: 'Learning', value: 'learning' },
  { label: 'Daily', value: 'daily' },
  { label: 'Interview', value: 'interview' },
];

export function NotePanel({ currentWorkspace }) {
  const [projects, setProjects] = useState([]);
  const [notes, setNotes] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const workspaceProjects = useMemo(() => {
    if (!currentWorkspace) {
      return [];
    }

    return projects.filter((project) => project.workspaceId === currentWorkspace.id);
  }, [projects, currentWorkspace]);

  const projectNameById = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project.name]));
  }, [projects]);

  const selectedWorkspaceProjectId = useMemo(() => {
    if (workspaceProjects.some((project) => project.id === selectedProjectId)) {
      return selectedProjectId;
    }

    return '';
  }, [workspaceProjects, selectedProjectId]);

  const visibleNotes = useMemo(() => {
    if (!currentWorkspace) {
      return [];
    }

    return notes.filter((note) => note.workspaceId === currentWorkspace.id);
  }, [notes, currentWorkspace]);

  async function loadNoteData() {
    setStatus('loading');
    setError('');

    const [nextProjects, nextNotes] = await Promise.all([listProjects(), listNotes()]);

    setProjects(nextProjects);
    setNotes(nextNotes);
    setStatus('ready');
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setStatus('loading');
        setError('');

        const [nextProjects, nextNotes] = await Promise.all([listProjects(), listNotes()]);

        if (cancelled) {
          return;
        }

        setProjects(nextProjects);
        setNotes(nextNotes);
        setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load notes');
          setStatus('error');
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleProjectChange(nextProjectId) {
    setSelectedProjectId(nextProjectId === 'none' ? '' : nextProjectId);
  }

  async function handleCreateNote(event) {
    event.preventDefault();

    if (!currentWorkspace) {
      setError('Create a workspace before adding notes');
      return;
    }

    try {
      setIsCreating(true);
      setError('');

      await createNote({
        workspaceId: currentWorkspace.id,
        projectId: selectedWorkspaceProjectId || null,
        title: noteTitle,
        content: noteContent,
        contentType: 'markdown',
        noteType,
      });

      setNoteTitle('');
      setNoteContent('');
      setNoteType('general');
      await loadNoteData();
      notifyActivityChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note');
      setStatus('error');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Card id="notes" className="mt-6 max-w-3xl">
      <CardHeader>
        <CardTitle>Notes</CardTitle>
        <CardDescription>Capture technical notes in the selected workspace.</CardDescription>
        {currentWorkspace && (
          <CardAction>
            <Badge variant="outline">{currentWorkspace.name}</Badge>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {currentWorkspace && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Project</span>
              <Select
                value={selectedWorkspaceProjectId || 'none'}
                onValueChange={handleProjectChange}
              >
                <SelectTrigger className="w-full">
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
          </div>
        )}

        <form className="flex flex-col gap-3" onSubmit={handleCreateNote}>
          <label className="sr-only" htmlFor="note-title">
            Note title
          </label>
          <Input
            id="note-title"
            value={noteTitle}
            onChange={(event) => setNoteTitle(event.target.value)}
            placeholder="Note title"
            disabled={!currentWorkspace}
            data-command-target="note-title"
          />

          <label className="sr-only" htmlFor="note-type">
            Note type
          </label>
          <Select value={noteType} onValueChange={setNoteType} disabled={!currentWorkspace}>
            <SelectTrigger id="note-type" className="w-full">
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

          <label className="sr-only" htmlFor="note-content">
            Content
          </label>
          <Textarea
            id="note-content"
            className="min-h-28 resize-y"
            value={noteContent}
            onChange={(event) => setNoteContent(event.target.value)}
            placeholder="Write a note..."
            disabled={!currentWorkspace}
          />

          <Button className="w-fit" disabled={isCreating || !currentWorkspace} type="submit">
            {isCreating ? 'Creating...' : 'Create note'}
          </Button>
        </form>

        {status === 'loading' && <p className="text-sm text-muted-foreground">Loading notes...</p>}

        {status === 'error' && <p className="text-sm text-destructive">{error}</p>}

        {status === 'ready' && !currentWorkspace && (
          <p className="text-sm text-muted-foreground">Create a workspace before adding notes.</p>
        )}

        {status === 'ready' && currentWorkspace && visibleNotes.length === 0 && (
          <p className="text-sm text-muted-foreground">No notes in this workspace yet.</p>
        )}

        {status === 'ready' && visibleNotes.length > 0 && (
          <ul className="flex flex-col gap-2">
            {visibleNotes.map((note) => (
              <li key={note.id} className="rounded-md border border-border px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="block text-sm font-medium text-foreground">
                      {note.title}
                    </strong>
                    <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">
                      {note.content || 'No content'}
                    </span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {note.projectId ? projectNameById.get(note.projectId) : 'No project'}
                    </span>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Badge variant="secondary">{note.noteType}</Badge>
                    <Badge variant="secondary">{note.contentType}</Badge>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
