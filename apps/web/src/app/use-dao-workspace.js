import { useCallback, useEffect, useMemo, useState } from 'react';
import { toastManager } from '@/components/ui/toast.jsx';
import { listActivities } from '@/features/activities/api.js';
import { notifyActivityChanged } from '@/features/activities/events.js';
import { ensureWelcomeNote } from '@/features/onboarding/welcome-note.js';
import { createNote, deleteNote, listNotes, updateNote } from '@/features/notes/api.js';
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
} from '@/features/projects/api.js';
import {
  getWorkspaceRecents,
  pruneRecents,
  readRecents,
  recordRecent,
} from '@/features/recents/storage.js';
import { getWorkingDirectory, updateWorkingDirectory } from '@/features/settings/api.js';
import { createWorkspace, listWorkspaces } from '@/features/workspaces/api.js';

function messageFrom(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

export function useDaoWorkspace() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState('');
  const [projects, setProjects] = useState([]);
  const [notes, setNotes] = useState([]);
  const [activities, setActivities] = useState([]);
  const [recents, setRecents] = useState(() => readRecents());
  const [activeView, setActiveView] = useState('home');
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [revealedProjectId, setRevealedProjectId] = useState('');

  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? null,
    [currentWorkspaceId, workspaces],
  );
  const workspaceProjects = useMemo(
    () => projects.filter((project) => project.workspaceId === currentWorkspaceId),
    [currentWorkspaceId, projects],
  );
  const workspaceNotes = useMemo(
    () => notes.filter((note) => note.workspaceId === currentWorkspaceId),
    [currentWorkspaceId, notes],
  );
  const workspaceActivities = useMemo(
    () => activities.filter((activity) => activity.workspaceId === currentWorkspaceId),
    [activities, currentWorkspaceId],
  );
  const workspaceRecents = useMemo(
    () => getWorkspaceRecents(recents, currentWorkspaceId),
    [currentWorkspaceId, recents],
  );
  const selectedNote = useMemo(
    () =>
      selectedEntity?.type === 'note'
        ? (notes.find((note) => note.id === selectedEntity.id) ?? null)
        : null,
    [notes, selectedEntity],
  );
  const refreshData = useCallback(async () => {
    const [nextProjects, nextNotes, nextActivities] = await Promise.all([
      listProjects(),
      listNotes(),
      listActivities(),
    ]);
    setProjects(nextProjects);
    setNotes(nextNotes);
    setActivities(nextActivities);
    const nextRecents = pruneRecents(readRecents(), { notes: nextNotes });
    setRecents(nextRecents);
    return { projects: nextProjects, notes: nextNotes };
  }, []);

  // Notes are the only openable entity now: a task is a line in a file, not
  // something the app can select or return to.
  const openEntity = useCallback((entity) => {
    if (!entity) return;
    const entityType = 'note';
    setSelectedEntity({ type: entityType, id: entity.id });
    setActiveView('home');
    setRecents((current) =>
      recordRecent(current, {
        workspaceId: entity.workspaceId,
        entityType,
        entityId: entity.id,
        title: entity.title,
      }),
    );
  }, []);

  const restoreWorkspaceContext = useCallback(
    async (workspace, entities) => {
      let nextNotes = entities.notes;
      let recent = getWorkspaceRecents(readRecents(), workspace.id)[0];

      if (!recent) {
        const welcomeNote = await ensureWelcomeNote(workspace, nextNotes);
        if (!nextNotes.some((note) => note.id === welcomeNote.id)) {
          nextNotes = [...nextNotes, welcomeNote];
          setNotes(nextNotes);
        }
        recent = {
          workspaceId: workspace.id,
          entityType: 'note',
          entityId: welcomeNote.id,
          title: welcomeNote.title,
          openedAt: new Date().toISOString(),
        };
      }

      const entity = nextNotes.find((note) => note.id === recent.entityId);
      if (entity) openEntity(entity);
    },
    [openEntity],
  );

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const nextWorkingDirectory = await getWorkingDirectory();
        if (cancelled) return;
        setWorkingDirectory(nextWorkingDirectory);
        if (!nextWorkingDirectory.configured) {
          setStatus('onboarding');
          return;
        }
        const nextWorkspaces = await listWorkspaces();
        if (cancelled) return;
        setWorkspaces(nextWorkspaces);
        const workspace = nextWorkspaces[0] ?? null;
        setCurrentWorkspaceId(workspace?.id ?? '');
        const entities = await refreshData();
        if (cancelled) return;
        if (workspace) await restoreWorkspaceContext(workspace, entities);
        setStatus('ready');
      } catch (nextError) {
        if (!cancelled) {
          setError(messageFrom(nextError, 'Failed to start Dao'));
          setStatus('error');
        }
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [refreshData, restoreWorkspaceContext]);

  async function completeOnboarding({ path, workspace }) {
    setStatus('loading');
    const nextWorkingDirectory = await updateWorkingDirectory({ path });
    const createdWorkspace = workspace
      ? await createWorkspace(workspace)
      : (await listWorkspaces())[0];
    const nextWorkspaces = await listWorkspaces();
    const current = createdWorkspace ?? nextWorkspaces[0];
    setWorkingDirectory(nextWorkingDirectory);
    setWorkspaces(nextWorkspaces);
    setCurrentWorkspaceId(current?.id ?? '');
    const entities = await refreshData();
    if (current) await restoreWorkspaceContext(current, entities);
    notifyActivityChanged();
    setStatus('ready');
  }

  async function selectWorkspace(workspaceId) {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) return;
    setCurrentWorkspaceId(workspaceId);
    setRevealedProjectId('');
    await restoreWorkspaceContext(workspace, { notes });
  }

  async function addWorkspace(input) {
    const workspace = await createWorkspace(input);
    const nextWorkspaces = [...workspaces, workspace];
    setWorkspaces(nextWorkspaces);
    setCurrentWorkspaceId(workspace.id);
    const welcomeNote = await ensureWelcomeNote(workspace, notes);
    setNotes((current) => [...current, welcomeNote]);
    openEntity(welcomeNote);
    return workspace;
  }

  async function addProject(input) {
    const project = await createProject({
      workspaceId: currentWorkspace.id,
      parentId: input.parentId ?? null,
      name: input.name,
      description: input.description ?? '',
    });
    setProjects((current) => [...current, project]);
    setRevealedProjectId(project.id);
    toastManager.add({ type: 'success', title: 'Folder created', description: project.name });
    return project;
  }

  // parentId is null for the workspace root, so it is passed through as-is.
  // The whole set is refetched because moving a folder moves every path
  // underneath it, not just this row.
  async function moveProject(project, parentId) {
    if ((project.parentId ?? null) === parentId) return;
    try {
      await updateProject(project.id, { parentId });
      await refreshData();
      if (parentId) setRevealedProjectId(parentId);
    } catch (moveError) {
      toastManager.add({
        type: 'error',
        title: 'Could not move folder',
        description: messageFrom(moveError, 'The folder was left where it was.'),
      });
    }
  }

  async function renameProject(project, name) {
    const updated = await updateProject(project.id, { name });
    setProjects((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function removeProject(project) {
    await deleteProject(project.id, { deleteNotes: false });
    setProjects((current) => current.filter((item) => item.id !== project.id));
    setRevealedProjectId('');
  }

  async function addNote({ projectId = null, title = 'Untitled' } = {}) {
    const note = await createNote({
      workspaceId: currentWorkspace.id,
      projectId,
      title,
      content: '',
      contentType: 'markdown',
      noteType: projectId ? 'project' : 'general',
    });
    setNotes((current) => [...current, note]);
    openEntity(note);
    return note;
  }

  async function renameNote(note, title) {
    const updated = await updateNote(note.id, { title });
    setNotes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setRecents((current) =>
      current.map((item) =>
        item.entityType === 'note' && item.entityId === updated.id
          ? { ...item, title: updated.title }
          : item,
      ),
    );
  }

  // projectId is null for the workspace root, so it is passed through as-is
  // rather than being coalesced away.
  async function moveNote(note, projectId) {
    if ((note.projectId ?? null) === projectId) return;
    const updated = await updateNote(note.id, { projectId });
    setNotes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    if (projectId) setRevealedProjectId(projectId);
    notifyActivityChanged();
  }

  async function removeNote(note) {
    await deleteNote(note.id);
    const nextNotes = notes.filter((item) => item.id !== note.id);
    setNotes(nextNotes);
    const nextRecents = pruneRecents(readRecents(), { notes: nextNotes });
    setRecents(nextRecents);
    if (selectedEntity?.type === 'note' && selectedEntity.id === note.id) {
      const fallback = getWorkspaceRecents(nextRecents, currentWorkspace.id)[0];
      const entity = fallback ? nextNotes.find((item) => item.id === fallback.entityId) : null;
      setSelectedEntity(null);
      if (entity) openEntity(entity);
    }
  }

  function openHome() {
    const recentNote = workspaceRecents.find((recent) => recent.entityType === 'note');
    const note = recentNote
      ? workspaceNotes.find((candidate) => candidate.id === recentNote.entityId)
      : workspaceNotes[0];
    if (note) {
      openEntity(note);
      return;
    }
    setSelectedEntity(null);
    setActiveView('home');
  }

  function revealSearchResult(result) {
    if (result.entityType === 'project') {
      setRevealedProjectId(result.entityId);
      setActiveView('home');
      return;
    }
    // A task hit is the whole task file, which has no entity to select — the
    // view itself is the destination.
    if (result.entityType === 'task') {
      setActiveView('tasks');
      return;
    }
    const entity = notes.find((note) => note.id === result.entityId);
    if (result.projectId) setRevealedProjectId(result.projectId);
    if (entity) openEntity(entity);
  }

  return {
    status,
    error,
    workingDirectory,
    workspaces,
    currentWorkspace,
    projects: workspaceProjects,
    notes: workspaceNotes,
    activities: workspaceActivities,
    recents: workspaceRecents,
    activeView,
    selectedEntity,
    selectedNote,
    revealedProjectId,
    setActiveView,
    setRevealedProjectId,
    completeOnboarding,
    selectWorkspace,
    addWorkspace,
    openHome,
    openEntity,
    refreshData,
    revealSearchResult,
    addProject,
    renameProject,
    moveProject,
    removeProject,
    addNote,
    renameNote,
    moveNote,
    removeNote,
  };
}
