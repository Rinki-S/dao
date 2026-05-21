import { useEffect, useMemo, useState } from 'react';
import { notifyActivityChanged } from '../../activities/events.js';
import { listProjects } from '../../projects/api.js';
import { listWorkspaces } from '../../workspaces/api.js';
import { createTask, listTasks } from '../api.js';

export function TaskPanel() {
  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState('medium');
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

  const visibleTasks = useMemo(() => {
    if (!selectedWorkspaceId) {
      return tasks;
    }

    return tasks.filter((task) => task.workspaceId === selectedWorkspaceId);
  }, [tasks, selectedWorkspaceId]);

  async function loadTaskData() {
    setStatus('loading');
    setError('');

    const [nextWorkspaces, nextProjects, nextTasks] = await Promise.all([
      listWorkspaces(),
      listProjects(),
      listTasks(),
    ]);

    setWorkspaces(nextWorkspaces);
    setProjects(nextProjects);
    setTasks(nextTasks);

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

        const [nextWorkspaces, nextProjects, nextTasks] = await Promise.all([
          listWorkspaces(),
          listProjects(),
          listTasks(),
        ]);

        if (cancelled) {
          return;
        }

        setWorkspaces(nextWorkspaces);
        setProjects(nextProjects);
        setTasks(nextTasks);

        if (nextWorkspaces.length > 0) {
          setSelectedWorkspaceId(nextWorkspaces[0].id);
        }

        setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load tasks');
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

  async function handleCreateTask(event) {
    event.preventDefault();

    if (!selectedWorkspaceId) {
      setError('Create a workspace before adding tasks');
      return;
    }

    try {
      setIsCreating(true);
      setError('');

      await createTask({
        workspaceId: selectedWorkspaceId,
        projectId: selectedProjectId || null,
        title: taskTitle,
        description: taskDescription,
        priority: taskPriority,
        dueDate: null,
      });

      setTaskTitle('');
      setTaskDescription('');
      setTaskPriority('medium');
      await loadTaskData();
      notifyActivityChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
      setStatus('error');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section id="tasks" className="mt-6 max-w-3xl rounded-lg border border-[#E5E7EB] bg-white p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#111827]">Tasks</h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            Create tasks for the selected workspace and optional project.
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

      <form className="mb-5 grid gap-3" onSubmit={handleCreateTask}>
        <input
          className="rounded-md border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#00A86B] focus:ring-3 focus:ring-[rgba(0,168,107,0.18)]"
          value={taskTitle}
          onChange={(event) => setTaskTitle(event.target.value)}
          placeholder="Task title"
          disabled={workspaces.length === 0}
          data-command-target="task-title"
        />

        <input
          className="rounded-md border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#00A86B] focus:ring-3 focus:ring-[rgba(0,168,107,0.18)]"
          value={taskDescription}
          onChange={(event) => setTaskDescription(event.target.value)}
          placeholder="Description"
          disabled={workspaces.length === 0}
        />

        <select
          className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm outline-none focus:border-[#00A86B] focus:ring-3 focus:ring-[rgba(0,168,107,0.18)]"
          value={taskPriority}
          onChange={(event) => setTaskPriority(event.target.value)}
          disabled={workspaces.length === 0}
        >
          <option value="low">Low priority</option>
          <option value="medium">Medium priority</option>
          <option value="high">High priority</option>
        </select>

        <button
          className="w-fit rounded-md bg-[#00A86B] px-4 py-2 text-sm font-medium text-white hover:bg-[#34C38F] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isCreating || workspaces.length === 0}
          type="submit"
        >
          {isCreating ? 'Creating...' : 'Create task'}
        </button>
      </form>

      {status === 'loading' && <p className="text-sm text-[#6B7280]">Loading tasks...</p>}

      {status === 'error' && <p className="text-sm text-red-600">{error}</p>}

      {status === 'ready' && workspaces.length === 0 && (
        <p className="text-sm text-[#6B7280]">Create a workspace before adding tasks.</p>
      )}

      {status === 'ready' && workspaces.length > 0 && visibleTasks.length === 0 && (
        <p className="text-sm text-[#6B7280]">No tasks in this workspace yet.</p>
      )}

      {status === 'ready' && visibleTasks.length > 0 && (
        <ul className="grid gap-2">
          {visibleTasks.map((task) => (
            <li key={task.id} className="rounded-md border border-[#E5E7EB] px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong className="block text-sm font-medium text-[#111827]">{task.title}</strong>
                  <span className="mt-1 block text-sm text-[#6B7280]">
                    {task.description || 'No description'}
                  </span>
                  <span className="mt-2 block text-xs text-[#9CA3AF]">
                    {task.projectId ? projectNameById.get(task.projectId) : 'No project'}
                  </span>
                </div>

                <div className="flex shrink-0 gap-2">
                  <span className="rounded-md bg-[#F2EFE8] px-2 py-1 text-xs text-[#6B7280]">
                    {task.priority}
                  </span>
                  <span className="rounded-md bg-[#F2EFE8] px-2 py-1 text-xs text-[#6B7280]">
                    {task.status}
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
