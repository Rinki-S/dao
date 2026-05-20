import { useEffect, useMemo, useState } from 'react';
import { listProjects } from '../../projects/api.js';
import { listWorkspaces } from '../../workspaces/api.js';
import { createNote, listNotes } from '../api.js';

const noteTypeOptions = [
  { label: 'General', value: 'general' },
  { label: 'Project', value: 'project' },
  { label: 'Learning', value: 'learning' },
  { label: 'Daily', value: 'daily' },
  { label: 'Interview', value: 'interview' },
];

export function NotePanel() {
  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [notes, setNotes] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const selectedWorkspace = useMemo(() => {
    return workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  }, [workspaces, selectedWorkspaceId]);

  const workspaceProjects = useMemo(() => {
    if (!selectedWorkspaceId) {
      return [];
    }

    return projects.filter((project) => project.workspaceId === selectedWorkspaceId);
  }, [projects, selectedWorkspaceId]);

  const projectNameById = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project.name]));
  }, [projects]);

  const visibleNotes = useMemo(() => {
    if (!selectedWorkspaceId) {
      return notes;
    }

    return notes.filter((note) => note.workspaceId === selectedWorkspaceId);
  }, [notes, selectedWorkspaceId]);

  async function loadNoteData() {
    setStatus('loading');
    setError('');

    const [nextWorkspaces, nextProjects, nextNotes] = await Promise.all([
      listWorkspaces(),
      listProjects(),
      listNotes(),
    ]);

    setWorkspaces(nextWorkspaces);
    setProjects(nextProjects);
    setNotes(nextNotes);

    if (!selectedWorkspaceId && nextWorkspaces.length > 0) {
      setSelectedWorkspaceId(nextWorkspaces[0].id);
    }

    setStatus('ready');
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setStatus('loading');
        setError('');

        const [nextWorkspaces, nextProjects, nextNotes] = await Promise.all([
          listWorkspaces(),
          listProjects(),
          listNotes(),
        ]);

        if (cancelled) {
          return;
        }

        setWorkspaces(nextWorkspaces);
        setProjects(nextProjects);
        setNotes(nextNotes);

        if (nextWorkspaces.length > 0) {
          setSelectedWorkspaceId(nextWorkspaces[0].id);
        }

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

  function handleWorkspaceChange(event) {
    setSelectedWorkspaceId(event.target.value);
    setSelectedProjectId('');
  }

  async function handleCreateNote(event) {
    event.preventDefault();

    if (!selectedWorkspaceId) {
      setError('Create a workspace before adding notes');
      return;
    }

    try {
      setIsCreating(true);
      setError('');

      await createNote({
        workspaceId: selectedWorkspaceId,
        projectId: selectedProjectId || null,
        title: noteTitle,
        content: noteContent,
        contentType: 'markdown',
        noteType,
      });

      setNoteTitle('');
      setNoteContent('');
      setNoteType('general');
      await loadNoteData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note');
      setStatus('error');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section id="notes" className="mt-6 max-w-3xl rounded-lg border border-[#E5E7EB] bg-white p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#111827]">Notes</h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            Capture technical notes in the selected workspace.
          </p>
        </div>

        {selectedWorkspace && (
          <span className="rounded-md border border-[#E5E7EB] px-2.5 py-1 text-xs text-[#6B7280]">
            {selectedWorkspace.name}
          </span>
        )}
      </div>

      {workspaces.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#6B7280]">Workspace</span>
            <select
              className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm outline-none focus:border-[#00A86B] focus:ring-3 focus:ring-[rgba(0,168,107,0.18)]"
              value={selectedWorkspaceId}
              onChange={handleWorkspaceChange}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#6B7280]">Project</span>
            <select
              className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm outline-none focus:border-[#00A86B] focus:ring-3 focus:ring-[rgba(0,168,107,0.18)]"
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
            >
              <option value="">No project</option>
              {workspaceProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <form className="mb-5 grid gap-3" onSubmit={handleCreateNote}>
        <input
          className="rounded-md border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#00A86B] focus:ring-3 focus:ring-[rgba(0,168,107,0.18)]"
          value={noteTitle}
          onChange={(event) => setNoteTitle(event.target.value)}
          placeholder="Note title"
          disabled={workspaces.length === 0}
          data-command-target="note-title"
        />

        <select
          className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm outline-none focus:border-[#00A86B] focus:ring-3 focus:ring-[rgba(0,168,107,0.18)]"
          value={noteType}
          onChange={(event) => setNoteType(event.target.value)}
          disabled={workspaces.length === 0}
        >
          {noteTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <textarea
          className="min-h-28 resize-y rounded-md border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#00A86B] focus:ring-3 focus:ring-[rgba(0,168,107,0.18)]"
          value={noteContent}
          onChange={(event) => setNoteContent(event.target.value)}
          placeholder="Write a note..."
          disabled={workspaces.length === 0}
        />

        <button
          className="w-fit rounded-md bg-[#00A86B] px-4 py-2 text-sm font-medium text-white hover:bg-[#34C38F] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isCreating || workspaces.length === 0}
          type="submit"
        >
          {isCreating ? 'Creating...' : 'Create note'}
        </button>
      </form>

      {status === 'loading' && <p className="text-sm text-[#6B7280]">Loading notes...</p>}

      {status === 'error' && <p className="text-sm text-red-600">{error}</p>}

      {status === 'ready' && workspaces.length === 0 && (
        <p className="text-sm text-[#6B7280]">Create a workspace before adding notes.</p>
      )}

      {status === 'ready' && workspaces.length > 0 && visibleNotes.length === 0 && (
        <p className="text-sm text-[#6B7280]">No notes in this workspace yet.</p>
      )}

      {status === 'ready' && visibleNotes.length > 0 && (
        <ul className="grid gap-2">
          {visibleNotes.map((note) => (
            <li key={note.id} className="rounded-md border border-[#E5E7EB] px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong className="block text-sm font-medium text-[#111827]">{note.title}</strong>
                  <span className="mt-1 line-clamp-2 block text-sm text-[#6B7280]">
                    {note.content || 'No content'}
                  </span>
                  <span className="mt-2 block text-xs text-[#9CA3AF]">
                    {note.projectId ? projectNameById.get(note.projectId) : 'No project'}
                  </span>
                </div>

                <div className="flex shrink-0 gap-2">
                  <span className="rounded-md bg-[#F2EFE8] px-2 py-1 text-xs text-[#6B7280]">
                    {note.noteType}
                  </span>
                  <span className="rounded-md bg-[#F2EFE8] px-2 py-1 text-xs text-[#6B7280]">
                    {note.contentType}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
