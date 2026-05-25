import { useEffect, useMemo, useState } from 'react';
import { CalendarToday, Circle, TaskAlt } from '@nine-thirty-five/material-symbols-react/rounded';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { notifyActivityChanged } from '../../activities/events.js';
import { listProjects } from '../../projects/api.js';
import { createTask, listTasks } from '../api.js';

const filterOptions = [
  { label: 'All', value: 'all' },
  { label: 'Todo', value: 'todo' },
  { label: 'Doing', value: 'doing' },
  { label: 'Done', value: 'done' },
];

const priorityLabels = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const statusLabels = {
  todo: 'Todo',
  doing: 'Doing',
  done: 'Done',
  archived: 'Archived',
};

function formatDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function TaskPanel({ currentWorkspace }) {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState('medium');
  const [activeFilter, setActiveFilter] = useState('all');
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

  const filteredTasks = useMemo(() => {
    if (activeFilter === 'all') {
      return visibleTasks;
    }

    return visibleTasks.filter((task) => task.status === activeFilter);
  }, [activeFilter, visibleTasks]);

  const taskCounts = useMemo(() => {
    return visibleTasks.reduce(
      (counts, task) => ({
        ...counts,
        [task.status]: (counts[task.status] ?? 0) + 1,
        all: counts.all + 1,
      }),
      { all: 0, todo: 0, doing: 0, done: 0 },
    );
  }, [visibleTasks]);

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
    <section id="tasks" className="flex flex-col gap-6">
      <form className="flex flex-col gap-3" onSubmit={handleCreateTask}>
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor="task-title">New task</FieldLabel>
            <div className="flex flex-col gap-2 lg:flex-row">
              <Input
                id="task-title"
                className="h-9 flex-1"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="Capture a task..."
                disabled={!currentWorkspace || isCreating}
                data-command-target="task-title"
              />

              <div className="flex flex-col gap-2 sm:flex-row lg:w-auto">
                <Select
                  value={selectedWorkspaceProjectId || 'none'}
                  onValueChange={handleProjectChange}
                  disabled={!currentWorkspace || isCreating}
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue placeholder="Project" />
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

                <Select
                  value={taskPriority}
                  onValueChange={setTaskPriority}
                  disabled={!currentWorkspace || isCreating}
                >
                  <SelectTrigger className="w-full sm:w-36">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>

                <Button disabled={isCreating || !currentWorkspace} type="submit">
                  {isCreating ? 'Adding...' : 'Add task'}
                </Button>
              </div>
            </div>
          </Field>

          <Field>
            <FieldLabel className="sr-only" htmlFor="task-description">
              Description
            </FieldLabel>
            <Input
              id="task-description"
              value={taskDescription}
              onChange={(event) => setTaskDescription(event.target.value)}
              placeholder="Description"
              disabled={!currentWorkspace || isCreating}
            />
          </Field>

          {error && <FieldError>{error}</FieldError>}
        </FieldGroup>
      </form>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={activeFilter} onValueChange={setActiveFilter}>
            <TabsList>
              {filterOptions.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {option.label}
                  <span className="tabular-nums text-muted-foreground">
                    {taskCounts[option.value] ?? 0}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {currentWorkspace && (
            <Badge variant="outline" className="w-fit">
              {currentWorkspace.name}
            </Badge>
          )}
        </div>

        <Separator />

        {status === 'loading' && <p className="text-sm text-muted-foreground">Loading tasks...</p>}

        {status === 'ready' && !currentWorkspace && (
          <p className="text-sm text-muted-foreground">Create a workspace before adding tasks.</p>
        )}

        {status === 'ready' && currentWorkspace && visibleTasks.length === 0 && (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center">
            <TaskAlt aria-hidden="true" className="size-[18px] shrink-0 translate-y-px" />
            <p className="text-sm font-medium text-foreground">No tasks yet</p>
            <p className="max-w-sm text-sm text-muted-foreground text-pretty">
              Capture the next concrete action for this workspace.
            </p>
          </div>
        )}

        {status === 'ready' &&
          currentWorkspace &&
          visibleTasks.length > 0 &&
          filteredTasks.length === 0 && (
            <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              No tasks match this filter.
            </div>
          )}

        {status === 'ready' && filteredTasks.length > 0 && (
          <ul className="flex flex-col">
            {filteredTasks.map((task) => {
              const isDone = task.status === 'done';
              const projectName = task.projectId ? projectNameById.get(task.projectId) : null;
              const dueDate = formatDate(task.dueDate);

              return (
                <li key={task.id} className="border-b border-border py-3 first:pt-0">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      aria-label={`Mark ${task.title} as done`}
                      checked={isDone}
                      disabled
                      className="mt-0.5"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'truncate text-sm font-medium text-foreground',
                            isDone && 'text-muted-foreground line-through',
                          )}
                        >
                          {task.title}
                        </span>
                        <Badge variant={task.priority === 'high' ? 'default' : 'secondary'}>
                          {priorityLabels[task.priority]}
                        </Badge>
                      </div>

                      {task.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {task.description}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Circle aria-hidden="true" className="size-3 shrink-0" />
                          {statusLabels[task.status]}
                        </span>
                        <span>{projectName ?? 'No project'}</span>
                        {dueDate && (
                          <span className="flex items-center gap-1">
                            <CalendarToday aria-hidden="true" className="size-3 shrink-0" />
                            {dueDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
