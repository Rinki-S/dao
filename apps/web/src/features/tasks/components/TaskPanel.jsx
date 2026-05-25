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
import { notifyActivityChanged } from '../../activities/events.js';
import { listProjects } from '../../projects/api.js';
import { createTask, listTasks } from '../api.js';

export function TaskPanel({ currentWorkspace }) {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState('medium');
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

  const visibleTasks = useMemo(() => {
    if (!currentWorkspace) {
      return [];
    }

    return tasks.filter((task) => task.workspaceId === currentWorkspace.id);
  }, [tasks, currentWorkspace]);

  async function loadTaskData() {
    setStatus('loading');
    setError('');

    const [nextProjects, nextTasks] = await Promise.all([listProjects(), listTasks()]);

    setProjects(nextProjects);
    setTasks(nextTasks);
    setStatus('ready');
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setStatus('loading');
        setError('');

        const [nextProjects, nextTasks] = await Promise.all([listProjects(), listTasks()]);

        if (cancelled) {
          return;
        }

        setProjects(nextProjects);
        setTasks(nextTasks);
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

  function handleProjectChange(nextProjectId) {
    setSelectedProjectId(nextProjectId === 'none' ? '' : nextProjectId);
  }

  async function handleCreateTask(event) {
    event.preventDefault();

    if (!currentWorkspace) {
      setError('Create a workspace before adding tasks');
      return;
    }

    try {
      setIsCreating(true);
      setError('');

      await createTask({
        workspaceId: currentWorkspace.id,
        projectId: selectedWorkspaceProjectId || null,
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
    <Card id="tasks" className="mt-6 max-w-3xl">
      <CardHeader>
        <CardTitle>Tasks</CardTitle>
        <CardDescription>
          Create tasks for the selected workspace and optional project.
        </CardDescription>
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

        <form className="flex flex-col gap-3" onSubmit={handleCreateTask}>
          <label className="sr-only" htmlFor="task-title">
            Task title
          </label>
          <Input
            id="task-title"
            value={taskTitle}
            onChange={(event) => setTaskTitle(event.target.value)}
            placeholder="Task title"
            disabled={!currentWorkspace}
            data-command-target="task-title"
          />

          <label className="sr-only" htmlFor="task-description">
            Description
          </label>
          <Input
            id="task-description"
            value={taskDescription}
            onChange={(event) => setTaskDescription(event.target.value)}
            placeholder="Description"
            disabled={!currentWorkspace}
          />

          <label className="sr-only" htmlFor="task-priority">
            Priority
          </label>
          <Select value={taskPriority} onValueChange={setTaskPriority} disabled={!currentWorkspace}>
            <SelectTrigger id="task-priority" className="w-full">
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="low">Low priority</SelectItem>
                <SelectItem value="medium">Medium priority</SelectItem>
                <SelectItem value="high">High priority</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button className="w-fit" disabled={isCreating || !currentWorkspace} type="submit">
            {isCreating ? 'Creating...' : 'Create task'}
          </Button>
        </form>

        {status === 'loading' && <p className="text-sm text-muted-foreground">Loading tasks...</p>}

        {status === 'error' && <p className="text-sm text-destructive">{error}</p>}

        {status === 'ready' && !currentWorkspace && (
          <p className="text-sm text-muted-foreground">Create a workspace before adding tasks.</p>
        )}

        {status === 'ready' && currentWorkspace && visibleTasks.length === 0 && (
          <p className="text-sm text-muted-foreground">No tasks in this workspace yet.</p>
        )}

        {status === 'ready' && visibleTasks.length > 0 && (
          <ul className="flex flex-col gap-2">
            {visibleTasks.map((task) => (
              <li key={task.id} className="rounded-md border border-border px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="block text-sm font-medium text-foreground">
                      {task.title}
                    </strong>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {task.description || 'No description'}
                    </span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {task.projectId ? projectNameById.get(task.projectId) : 'No project'}
                    </span>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Badge variant="secondary">{task.priority}</Badge>
                    <Badge variant="secondary">{task.status}</Badge>
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
