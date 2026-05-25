import { Fragment, useEffect, useMemo, useState } from 'react';
import { Add, CalendarToday, TaskAlt } from '@nine-thirty-five/material-symbols-react/rounded';
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
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { notifyActivityChanged } from '../../activities/events.js';
import { listProjects } from '../../projects/api.js';
import { createTask, listTasks, updateTaskStatus } from '../api.js';

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
  const [updatingTaskIds, setUpdatingTaskIds] = useState(() => new Set());
  const [childTaskParentId, setChildTaskParentId] = useState('');
  const [childTaskTitle, setChildTaskTitle] = useState('');
  const [isCreatingChild, setIsCreatingChild] = useState(false);

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

  const parentTasks = useMemo(() => {
    return visibleTasks.filter((task) => task.parentId === null);
  }, [visibleTasks]);

  const childrenByParentId = useMemo(() => {
    const nextChildrenByParentId = new Map();

    for (const task of visibleTasks) {
      if (!task.parentId) {
        continue;
      }

      const children = nextChildrenByParentId.get(task.parentId) ?? [];
      children.push(task);
      nextChildrenByParentId.set(task.parentId, children);
    }

    return nextChildrenByParentId;
  }, [visibleTasks]);

  const filteredParentTasks = useMemo(() => {
    if (activeFilter === 'all') {
      return parentTasks;
    }

    return parentTasks.filter((task) => task.status === activeFilter);
  }, [activeFilter, parentTasks]);

  const taskCounts = useMemo(() => {
    return parentTasks.reduce(
      (counts, task) => ({
        ...counts,
        [task.status]: (counts[task.status] ?? 0) + 1,
        all: counts.all + 1,
      }),
      { all: 0, todo: 0, doing: 0, done: 0 },
    );
  }, [parentTasks]);

  async function loadTaskData({ showLoading = true } = {}) {
    if (showLoading) {
      setStatus('loading');
    }

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

  async function handleToggleTaskDone(task) {
    const nextStatus = task.status === 'done' ? 'todo' : 'done';

    setUpdatingTaskIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(task.id);
      return nextIds;
    });
    setError('');

    try {
      await updateTaskStatus(task.id, { status: nextStatus });
      await loadTaskData({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    } finally {
      setUpdatingTaskIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(task.id);
        return nextIds;
      });
    }
  }

  function openChildTaskForm(parentTaskId) {
    setChildTaskParentId(parentTaskId);
    setChildTaskTitle('');
    setError('');
  }

  function closeChildTaskForm() {
    setChildTaskParentId('');
    setChildTaskTitle('');
  }

  async function handleCreateChildTask(event, parentTask) {
    event.preventDefault();

    if (!currentWorkspace) {
      setError('Create a workspace before adding tasks');
      return;
    }

    try {
      setIsCreatingChild(true);
      setError('');

      await createTask({
        workspaceId: currentWorkspace.id,
        projectId: parentTask.projectId,
        parentId: parentTask.id,
        title: childTaskTitle,
        description: '',
        priority: parentTask.priority,
        dueDate: null,
      });

      closeChildTaskForm();
      await loadTaskData();
      notifyActivityChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create child task');
    } finally {
      setIsCreatingChild(false);
    }
  }

  function getCheckboxState(task) {
    if (task.status === 'doing') {
      return 'indeterminate';
    }

    return task.status === 'done';
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
          filteredParentTasks.length === 0 && (
            <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              No tasks match this filter.
            </div>
          )}

        {status === 'ready' && filteredParentTasks.length > 0 && (
          <div className="-mx-8">
            <Table>
              <TableBody>
                {filteredParentTasks.map((task) => {
                  const taskChildren = childrenByParentId.get(task.id) ?? [];
                  const projectName = task.projectId ? projectNameById.get(task.projectId) : null;
                  const dueDate = formatDate(task.dueDate);
                  const isDone = task.status === 'done';
                  const isUpdating = updatingTaskIds.has(task.id);
                  const isAddingChild = childTaskParentId === task.id;

                  return (
                    <Fragment key={task.id}>
                      <TableRow key={task.id}>
                        <TableCell className="pl-8">
                          <div className="flex min-w-0 items-center gap-3">
                            <Checkbox
                              aria-label={`Toggle ${task.title}`}
                              checked={getCheckboxState(task)}
                              disabled={isUpdating}
                              onCheckedChange={() => {
                                void handleToggleTaskDone(task);
                              }}
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <div
                                  className={cn(
                                    'min-w-0 truncate text-sm font-medium text-foreground',
                                    isDone && 'text-muted-foreground line-through',
                                  )}
                                >
                                  {task.title}
                                  {projectName && (
                                    <span className="font-normal text-muted-foreground">
                                      /{projectName}
                                    </span>
                                  )}
                                </div>
                                <Badge variant={task.priority === 'high' ? 'default' : 'secondary'}>
                                  {priorityLabels[task.priority]}
                                </Badge>
                              </div>

                              {task.description && (
                                <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                  {task.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="w-28 text-muted-foreground">
                          {dueDate && (
                            <span className="flex items-center justify-end gap-1 text-xs">
                              <CalendarToday aria-hidden="true" className="size-3 shrink-0" />
                              {dueDate}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="w-12 pr-8 text-right">
                          <Button
                            aria-label={`Add child todo to ${task.title}`}
                            disabled={isCreatingChild}
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                            onClick={() => openChildTaskForm(task.id)}
                          >
                            <Add
                              aria-hidden="true"
                              className="size-[18px] shrink-0 translate-y-px"
                            />
                          </Button>
                        </TableCell>
                      </TableRow>

                      {isAddingChild && (
                        <TableRow key={`${task.id}-child-form`}>
                          <TableCell className="pl-16" colSpan={3}>
                            <form
                              className="flex items-center gap-2"
                              onSubmit={(event) => {
                                void handleCreateChildTask(event, task);
                              }}
                            >
                              <Input
                                aria-label={`Child todo for ${task.title}`}
                                className="h-8"
                                disabled={isCreatingChild}
                                placeholder="Add child todo..."
                                value={childTaskTitle}
                                onChange={(event) => setChildTaskTitle(event.target.value)}
                              />
                              <Button disabled={isCreatingChild} size="sm" type="submit">
                                Add
                              </Button>
                              <Button
                                disabled={isCreatingChild}
                                size="sm"
                                type="button"
                                variant="ghost"
                                onClick={closeChildTaskForm}
                              >
                                Cancel
                              </Button>
                            </form>
                          </TableCell>
                        </TableRow>
                      )}

                      {taskChildren.map((childTask) => {
                        const childProjectName = childTask.projectId
                          ? projectNameById.get(childTask.projectId)
                          : null;
                        const childDueDate = formatDate(childTask.dueDate);
                        const isChildDone = childTask.status === 'done';
                        const isChildUpdating = updatingTaskIds.has(childTask.id);

                        return (
                          <TableRow key={childTask.id}>
                            <TableCell className="pl-16">
                              <div className="flex min-w-0 items-center gap-3">
                                <Checkbox
                                  aria-label={`Toggle ${childTask.title}`}
                                  checked={getCheckboxState(childTask)}
                                  disabled={isChildUpdating}
                                  onCheckedChange={() => {
                                    void handleToggleTaskDone(childTask);
                                  }}
                                />

                                <div className="min-w-0 flex-1">
                                  <div
                                    className={cn(
                                      'min-w-0 truncate text-sm font-medium text-foreground',
                                      isChildDone && 'text-muted-foreground line-through',
                                    )}
                                  >
                                    {childTask.title}
                                    {childProjectName && (
                                      <span className="font-normal text-muted-foreground">
                                        /{childProjectName}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="w-28 text-muted-foreground">
                              {childDueDate && (
                                <span className="flex items-center justify-end gap-1 text-xs">
                                  <CalendarToday aria-hidden="true" className="size-3 shrink-0" />
                                  {childDueDate}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="w-12 pr-8" />
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </section>
  );
}
