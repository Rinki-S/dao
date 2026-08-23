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
import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
  updateTaskStatus,
} from '@/features/tasks/api.js';
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
  const [tasks, setTasks] = useState([]);
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
  const workspaceTasks = useMemo(
    () => tasks.filter((task) => task.workspaceId === currentWorkspaceId),
    [currentWorkspaceId, tasks],
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
  const selectedTask = useMemo(
    () =>
      selectedEntity?.type === 'task'
        ? (tasks.find((task) => task.id === selectedEntity.id) ?? null)
        : null,
    [selectedEntity, tasks],
  );

  const refreshData = useCallback(async () => {
    const [nextProjects, nextNotes, nextTasks, nextActivities] = await Promise.all([
      listProjects(),
      listNotes(),
      listTasks(),
      listActivities(),
    ]);
    setProjects(nextProjects);
    setNotes(nextNotes);
    setTasks(nextTasks);
    setActivities(nextActivities);
    const nextRecents = pruneRecents(readRecents(), { notes: nextNotes, tasks: nextTasks });
    setRecents(nextRecents);
    return { projects: nextProjects, notes: nextNotes, tasks: nextTasks };
  }, []);

  const openEntity = useCallback((entity) => {
    if (!entity) return;
    const entityType = entity.contentType ? 'note' : 'task';
    setSelectedEntity({ type: entityType, id: entity.id });
    setActiveView(entityType === 'task' ? 'tasks' : 'home');
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

      const entity =
        recent.entityType === 'note'
          ? nextNotes.find((note) => note.id === recent.entityId)
          : entities.tasks.find((task) => task.id === recent.entityId);
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
    await restoreWorkspaceContext(workspace, { notes, tasks });
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
      name: input.name,
      description: input.description ?? '',
    });
    setProjects((current) => [...current, project]);
    setRevealedProjectId(project.id);
    toastManager.add({ type: 'success', title: 'Folder created', description: project.name });
    return project;
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
    const nextRecents = pruneRecents(readRecents(), { notes: nextNotes, tasks });
    setRecents(nextRecents);
    if (selectedEntity?.type === 'note' && selectedEntity.id === note.id) {
      const fallback = getWorkspaceRecents(nextRecents, currentWorkspace.id)[0];
      const entity = fallback
        ? fallback.entityType === 'note'
          ? nextNotes.find((item) => item.id === fallback.entityId)
          : tasks.find((item) => item.id === fallback.entityId)
        : null;
      setSelectedEntity(null);
      if (entity) openEntity(entity);
    }
  }

  async function addTask(input) {
    const task = await createTask({
      workspaceId: currentWorkspace.id,
      projectId: input.projectId ?? null,
      parentId: input.parentId ?? null,
      title: input.title,
      description: input.description ?? '',
      priority: input.priority ?? 'medium',
      dueDate: input.dueDate ?? null,
    });
    setTasks((current) => [...current, task]);
    openEntity(task);
    return task;
  }

  async function patchTask(taskId, input) {
    const updated = await updateTask(taskId, input);
    setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    return updated;
  }

  async function toggleTask(task) {
    const updated = await updateTaskStatus(task.id, {
      status: task.status === 'done' ? 'todo' : 'done',
    });
    setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function removeTask(task) {
    await deleteTask(task.id);
    const nextTasks = tasks.filter((item) => item.id !== task.id && item.parentId !== task.id);
    setTasks(nextTasks);
    setRecents(pruneRecents(readRecents(), { notes, tasks: nextTasks }));
    if (selectedEntity?.type === 'task' && selectedEntity.id === task.id) setSelectedEntity(null);
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
    const entity =
      result.entityType === 'note'
        ? notes.find((note) => note.id === result.entityId)
        : tasks.find((task) => task.id === result.entityId);
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
    tasks: workspaceTasks,
    activities: workspaceActivities,
    recents: workspaceRecents,
    activeView,
    selectedEntity,
    selectedNote,
    selectedTask,
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
    removeProject,
    addNote,
    renameNote,
    moveNote,
    removeNote,
    addTask,
    patchTask,
    toggleTask,
    removeTask,
  };
}
