import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Add,
  CalendarToday,
  KeyboardArrowRight,
  TaskAlt,
} from '@nine-thirty-five/material-symbols-react/rounded';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { notifyActivityChanged } from '../../activities/events.js';
import { listProjects } from '../../projects/api.js';
import { createTask, listTasks, updateTaskStatus } from '../api.js';

const priorityLabels = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const priorityOptions = [
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
];

const statusSortOrder = {
  todo: 0,
  doing: 1,
  done: 2,
  archived: 3,
};

const prioritySortOrder = {
  high: 0,
  medium: 1,
  low: 2,
};

function compareTasks(firstTask, secondTask) {
  const statusDifference =
    (statusSortOrder[firstTask.status] ?? 99) - (statusSortOrder[secondTask.status] ?? 99);
  if (statusDifference !== 0) {
    return statusDifference;
  }

  const priorityDifference =
    (prioritySortOrder[firstTask.priority] ?? 99) - (prioritySortOrder[secondTask.priority] ?? 99);
  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  return firstTask.title.localeCompare(secondTask.title, undefined, { sensitivity: 'base' });
}

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
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [updatingTaskIds, setUpdatingTaskIds] = useState(() => new Set());
  const [childTaskParentId, setChildTaskParentId] = useState('');
  const [childTaskTitle, setChildTaskTitle] = useState('');
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState(() => new Set());
  const taskTitleInputRef = useRef(null);

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
    return visibleTasks.filter((task) => task.parentId === null).toSorted(compareTasks);
  }, [visibleTasks]);

  const childrenByParentId = useMemo(() => {
    const nextChildrenByParentId = new Map();

    for (const task of visibleTasks) {
      if (!task.parentId) {
        continue;
      }

      const children = nextChildrenByParentId.get(task.parentId) ?? [];
      children.push(task);
      children.sort(compareTasks);
      nextChildrenByParentId.set(task.parentId, children);
    }

    return nextChildrenByParentId;
  }, [visibleTasks]);

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

    if (taskTitle.trim() === '') {
      setError('Task title is required');
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
      setIsDescriptionOpen(false);
      await loadTaskData();
      notifyActivityChanged();
      window.requestAnimationFrame(() => {
        taskTitleInputRef.current?.focus();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
      setStatus('error');
    } finally {
      setIsCreating(false);
    }
  }

  function handleQuickAddKeyDown(event) {
    if (event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    setTaskTitle('');
    setTaskDescription('');
    setTaskPriority('medium');
    setIsDescriptionOpen(false);
    setIsQuickAddOpen(false);
    setError('');
    taskTitleInputRef.current?.blur();
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
    setCollapsedTaskIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(parentTaskId);
      return nextIds;
    });
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

  function toggleTaskCollapse(taskId) {
    setCollapsedTaskIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(taskId)) {
        nextIds.delete(taskId);
      } else {
        nextIds.add(taskId);
      }

      return nextIds;
    });
  }

  return (
    <section id="tasks" className="flex flex-col gap-6">
      <form
        className="-mx-8 flex flex-col gap-3 px-8"
        onSubmit={handleCreateTask}
        onKeyDown={handleQuickAddKeyDown}
      >
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel className="sr-only" htmlFor="task-title">
              Task title
            </FieldLabel>
            <div className="flex flex-col gap-2 sm:flex-row">
              <InputGroup className="h-9">
                <InputGroupInput
                  id="task-title"
                  ref={taskTitleInputRef}
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  onFocus={() => setIsQuickAddOpen(true)}
                  placeholder="Add a task..."
                  disabled={!currentWorkspace || isCreating}
                  data-command-target="task-title"
                />

                {isQuickAddOpen && (
                  <InputGroupAddon align="inline-end" className="gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <InputGroupButton
                          aria-label="Select project"
                          disabled={!currentWorkspace || isCreating}
                        >
                          {selectedWorkspaceProjectId
                            ? (projectNameById.get(selectedWorkspaceProjectId) ?? 'Project')
                            : 'No project'}
                        </InputGroupButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuRadioGroup
                          value={selectedWorkspaceProjectId || 'none'}
                          onValueChange={handleProjectChange}
                        >
                          <DropdownMenuGroup>
                            <DropdownMenuRadioItem value="none">No project</DropdownMenuRadioItem>
                            {workspaceProjects.map((project) => (
                              <DropdownMenuRadioItem key={project.id} value={project.id}>
                                {project.name}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuGroup>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <InputGroupButton
                          aria-label="Select priority"
                          disabled={!currentWorkspace || isCreating}
                        >
                          {priorityLabels[taskPriority]}
                        </InputGroupButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuRadioGroup
                          value={taskPriority}
                          onValueChange={setTaskPriority}
                        >
                          <DropdownMenuGroup>
                            {priorityOptions.map((option) => (
                              <DropdownMenuRadioItem key={option.value} value={option.value}>
                                {option.label}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuGroup>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </InputGroupAddon>
                )}
              </InputGroup>

              {isQuickAddOpen && (
                <Button disabled={isCreating || !currentWorkspace} type="submit">
                  {isCreating ? 'Adding...' : 'Add'}
                </Button>
              )}
            </div>
          </Field>

          {isQuickAddOpen && (
            <>
              <div className="flex">
                <Button
                  className="w-fit"
                  disabled={!currentWorkspace || isCreating}
                  type="button"
                  variant="ghost"
                  onClick={() => setIsDescriptionOpen((isOpen) => !isOpen)}
                >
                  {isDescriptionOpen ? 'Hide description' : 'Add description'}
                </Button>
              </div>

              {isDescriptionOpen && (
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
              )}
            </>
          )}

          {error && <FieldError>{error}</FieldError>}
        </FieldGroup>
      </form>

      <div className="flex flex-col gap-4">
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
          parentTasks.length === 0 && (
            <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              No tasks match this filter.
            </div>
          )}

        {status === 'ready' && parentTasks.length > 0 && (
          <div className="-mx-8">
            <Table className={'border-t border-b'}>
              <TableBody>
                {parentTasks.map((task) => {
                  const taskChildren = childrenByParentId.get(task.id) ?? [];
                  const projectName = task.projectId ? projectNameById.get(task.projectId) : null;
                  const dueDate = formatDate(task.dueDate);
                  const isDone = task.status === 'done';
                  const isUpdating = updatingTaskIds.has(task.id);
                  const isAddingChild = childTaskParentId === task.id;
                  const hasChildren = taskChildren.length > 0;
                  const isCollapsed = collapsedTaskIds.has(task.id);

                  return (
                    <Fragment key={task.id}>
                      <TableRow key={task.id}>
                        <TableCell className="relative pl-8">
                          {hasChildren ? (
                            <Button
                              aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${task.title}`}
                              className="absolute top-1/2 left-1 -translate-y-1/2 active:not-aria-[haspopup]:-translate-y-1/2"
                              size="icon-xs"
                              type="button"
                              variant="ghost"
                              onClick={() => toggleTaskCollapse(task.id)}
                            >
                              <KeyboardArrowRight
                                aria-hidden="true"
                                className={cn(
                                  'size-[18px] shrink-0 transition-transform',
                                  !isCollapsed && 'rotate-90',
                                )}
                              />
                            </Button>
                          ) : null}
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

                      {isAddingChild && !isCollapsed && (
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

                      {!isCollapsed &&
                        taskChildren.map((childTask) => {
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
