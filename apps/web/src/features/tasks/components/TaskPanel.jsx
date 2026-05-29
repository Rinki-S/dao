import { useEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import Calendar03Icon from '@hugeicons/core-free-icons/Calendar03Icon';
import MoreHorizontalIcon from '@hugeicons/core-free-icons/MoreHorizontalIcon';
import TaskDone01Icon from '@hugeicons/core-free-icons/TaskDone01Icon';
import {
  Button,
  Checkbox,
  Chip,
  Dropdown,
  FieldError,
  InputGroup,
  Label,
  Popover,
  Table,
  TextArea,
  TextField,
} from '@heroui/react';
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

const quickAddAccessoryButtonClassName =
  '[--button-fg:var(--field-placeholder)] hover:[--button-fg:var(--field-foreground)] focus-visible:[--button-fg:var(--field-foreground)]';

const taskRowIconButtonClassName =
  'size-7 min-w-0 p-0 [--button-fg:var(--muted)] hover:[--button-fg:var(--foreground)] focus-visible:[--button-fg:var(--foreground)]';

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
  const [isDescriptionPopoverOpen, setIsDescriptionPopoverOpen] = useState(false);
  const [updatingTaskIds, setUpdatingTaskIds] = useState(() => new Set());
  const [childTaskParentId, setChildTaskParentId] = useState('');
  const [childTaskTitle, setChildTaskTitle] = useState('');
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState(() => new Set());
  const [expandedDescriptionTaskIds, setExpandedDescriptionTaskIds] = useState(() => new Set());
  const [hasTaskScrollOffset, setHasTaskScrollOffset] = useState(false);
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
      setIsDescriptionPopoverOpen(false);
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
    setIsDescriptionPopoverOpen(false);
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

  function renderTaskCheckbox(task, isDisabled) {
    const checkboxState = getCheckboxState(task);

    return (
      <Checkbox
        aria-label={`Toggle ${task.title}`}
        isDisabled={isDisabled}
        isIndeterminate={checkboxState === 'indeterminate'}
        isSelected={checkboxState === true}
        onChange={() => {
          void handleToggleTaskDone(task);
        }}
      >
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
      </Checkbox>
    );
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

  function toggleTaskDescription(taskId) {
    setExpandedDescriptionTaskIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(taskId)) {
        nextIds.delete(taskId);
      } else {
        nextIds.add(taskId);
      }

      return nextIds;
    });
  }

  function handleTaskListScroll(event) {
    const nextHasTaskScrollOffset = event.currentTarget.scrollTop > 0;
    setHasTaskScrollOffset((currentHasTaskScrollOffset) =>
      currentHasTaskScrollOffset === nextHasTaskScrollOffset
        ? currentHasTaskScrollOffset
        : nextHasTaskScrollOffset,
    );
  }

  return (
    <section id="tasks" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <form
        className="flex shrink-0 flex-col gap-3 px-8 py-4"
        onSubmit={handleCreateTask}
        onKeyDown={handleQuickAddKeyDown}
      >
        <div className="flex w-full flex-col gap-3">
          <TextField
            className="w-full min-w-0"
            fullWidth
            isDisabled={!currentWorkspace || isCreating}
            name="task-title"
            value={taskTitle}
            onChange={setTaskTitle}
          >
            <Label className="sr-only" htmlFor="task-title">
              Task title
            </Label>
            <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row">
              <InputGroup className="w-full min-w-0 flex-1" fullWidth>
                <InputGroup.Input
                  id="task-title"
                  ref={taskTitleInputRef}
                  data-command-target="task-title"
                  placeholder="Add a task..."
                />

                <InputGroup.Suffix className="gap-1 pr-1">
                  <Dropdown>
                    <Button
                      aria-label="Select project"
                      className={quickAddAccessoryButtonClassName}
                      isDisabled={!currentWorkspace || isCreating}
                      size="sm"
                      variant="ghost"
                    >
                      {({ isPressed }) => (
                        <span className={cn(isPressed && 'scale-[0.97]')}>
                          {selectedWorkspaceProjectId
                            ? (projectNameById.get(selectedWorkspaceProjectId) ?? 'Project')
                            : 'No project'}
                        </span>
                      )}
                    </Button>
                    <Dropdown.Popover className="w-52" placement="bottom end">
                      <Dropdown.Menu
                        selectedKeys={new Set([selectedWorkspaceProjectId || 'none'])}
                        selectionMode="single"
                        onSelectionChange={(keys) => {
                          const [nextProjectId] = [...keys];
                          handleProjectChange(String(nextProjectId ?? 'none'));
                        }}
                      >
                        <Dropdown.Item id="none" textValue="No project">
                          <Dropdown.ItemIndicator />
                          <Label>No project</Label>
                        </Dropdown.Item>
                        {workspaceProjects.map((project) => (
                          <Dropdown.Item id={project.id} key={project.id} textValue={project.name}>
                            <Dropdown.ItemIndicator />
                            <Label>{project.name}</Label>
                          </Dropdown.Item>
                        ))}
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>

                  <Dropdown>
                    <Button
                      aria-label="Select priority"
                      className={quickAddAccessoryButtonClassName}
                      isDisabled={!currentWorkspace || isCreating}
                      size="sm"
                      variant="ghost"
                    >
                      {({ isPressed }) => (
                        <span className={cn(isPressed && 'scale-[0.97]')}>
                          {priorityLabels[taskPriority]}
                        </span>
                      )}
                    </Button>
                    <Dropdown.Popover className="w-36" placement="bottom end">
                      <Dropdown.Menu
                        selectedKeys={new Set([taskPriority])}
                        selectionMode="single"
                        onSelectionChange={(keys) => {
                          const [nextPriority] = [...keys];
                          if (nextPriority) {
                            setTaskPriority(String(nextPriority));
                          }
                        }}
                      >
                        {priorityOptions.map((option) => (
                          <Dropdown.Item
                            id={option.value}
                            key={option.value}
                            textValue={option.label}
                          >
                            <Dropdown.ItemIndicator />
                            <Label>{option.label}</Label>
                          </Dropdown.Item>
                        ))}
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>

                  <Popover
                    isOpen={isDescriptionPopoverOpen}
                    onOpenChange={setIsDescriptionPopoverOpen}
                  >
                    <Popover.Trigger>
                      <Button
                        aria-label="Edit description"
                        className={quickAddAccessoryButtonClassName}
                        isDisabled={!currentWorkspace || isCreating}
                        size="sm"
                        variant="ghost"
                      >
                        {taskDescription.trim() ? 'Description' : 'No description'}
                      </Button>
                    </Popover.Trigger>
                    <Popover.Content className="w-80" placement="bottom end">
                      <Popover.Dialog className="flex flex-col gap-2">
                        <Label htmlFor="task-description">Description</Label>
                        <TextArea
                          id="task-description"
                          className="max-h-48 min-h-28 resize-none overflow-y-auto"
                          value={taskDescription}
                          onChange={(event) => setTaskDescription(event.target.value)}
                          placeholder="Add details..."
                          isDisabled={!currentWorkspace || isCreating}
                          variant="secondary"
                        />
                      </Popover.Dialog>
                    </Popover.Content>
                  </Popover>
                </InputGroup.Suffix>
              </InputGroup>

              <Button
                className="h-9 shrink-0"
                isDisabled={isCreating || !currentWorkspace || taskTitle.trim() === ''}
                isPending={isCreating}
                type="submit"
              >
                {isCreating ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </TextField>

          {error && <FieldError>{error}</FieldError>}
        </div>
      </form>

      <div className="relative min-h-0 flex-1">
        <div
          data-testid="task-scroll-shadow"
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-linear-to-b from-background to-transparent transition-opacity duration-150 ease-out',
            hasTaskScrollOffset ? 'opacity-100' : 'opacity-0',
          )}
        />

        <div className="h-full min-h-0 overflow-y-auto" onScroll={handleTaskListScroll}>
          {status === 'loading' && (
            <p className="px-8 text-sm text-muted-foreground">Loading tasks...</p>
          )}

          {status === 'ready' && !currentWorkspace && (
            <p className="px-8 text-sm text-muted-foreground">
              Create a workspace before adding tasks.
            </p>
          )}

          {status === 'ready' && currentWorkspace && visibleTasks.length === 0 && (
            <div className="mx-8 flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center">
              <HugeiconsIcon
                icon={TaskDone01Icon}
                aria-hidden="true"
                className="size-[18px] shrink-0 translate-y-px"
              />
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
              <div className="mx-8 flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                No tasks match this filter.
              </div>
            )}

          {status === 'ready' && parentTasks.length > 0 && (
            <div className="px-8">
              <Table className="border-b" variant="secondary">
                <Table.ScrollContainer className="w-full overflow-x-auto">
                  <Table.Content aria-label="Tasks" className="w-full min-w-full">
                    <Table.Header className="sr-only">
                      <Table.Column isRowHeader>Task</Table.Column>
                      <Table.Column>Due</Table.Column>
                      <Table.Column>Actions</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {parentTasks.map((task) => {
                        const taskChildren = childrenByParentId.get(task.id) ?? [];
                        const projectName = task.projectId
                          ? projectNameById.get(task.projectId)
                          : null;
                        const dueDate = formatDate(task.dueDate);
                        const isDone = task.status === 'done';
                        const isUpdating = updatingTaskIds.has(task.id);
                        const isAddingChild = childTaskParentId === task.id;
                        const hasChildren = taskChildren.length > 0;
                        const isCollapsed = collapsedTaskIds.has(task.id);
                        const hasDescription = task.description.trim() !== '';
                        const isDescriptionExpanded = expandedDescriptionTaskIds.has(task.id);
                        const hasVisibleChildren = hasChildren && !isCollapsed;
                        const isChildFormVisible = isAddingChild && !isCollapsed;
                        const isTaskDetailVisible =
                          (hasDescription && isDescriptionExpanded) ||
                          isChildFormVisible ||
                          hasVisibleChildren;

                        return (
                          <Table.Row key={task.id} id={task.id}>
                            <Table.Cell className="p-0" colSpan={3}>
                              <div data-slot="task-row-layout" className="flex min-w-0 flex-col">
                                <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_7rem_5rem] items-center">
                                  <div className="relative min-w-0 py-2 pl-8">
                                    {hasChildren ? (
                                      <Button
                                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${task.title}`}
                                        className={cn(
                                          taskRowIconButtonClassName,
                                          'absolute top-1/2 left-1 -translate-y-1/2',
                                        )}
                                        isIconOnly
                                        size="sm"
                                        type="button"
                                        variant="ghost"
                                        onPress={() => toggleTaskCollapse(task.id)}
                                      >
                                        <HugeiconsIcon
                                          icon={ArrowRight01Icon}
                                          aria-hidden="true"
                                          className={cn(
                                            'size-[18px] shrink-0 transform-gpu transition-transform duration-150 ease-out',
                                            !isCollapsed && 'rotate-90',
                                          )}
                                        />
                                      </Button>
                                    ) : null}
                                    <div className="flex min-w-0 items-center gap-3">
                                      {renderTaskCheckbox(task, isUpdating)}

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
                                          <Chip
                                            color={task.priority === 'high' ? 'accent' : 'default'}
                                            size="sm"
                                            variant={task.priority === 'high' ? 'primary' : 'soft'}
                                          >
                                            {priorityLabels[task.priority]}
                                          </Chip>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="px-2 text-muted-foreground">
                                    {dueDate && (
                                      <span className="flex items-center justify-end gap-1 text-xs tabular-nums">
                                        <HugeiconsIcon
                                          icon={Calendar03Icon}
                                          aria-hidden="true"
                                          className="size-3 shrink-0"
                                        />
                                        {dueDate}
                                      </span>
                                    )}
                                  </div>

                                  <div className="pr-8 text-right">
                                    <div className="flex justify-end gap-1">
                                      {hasDescription && (
                                        <Button
                                          aria-label={`${isDescriptionExpanded ? 'Hide' : 'Show'} notes for ${task.title}`}
                                          className={taskRowIconButtonClassName}
                                          isIconOnly
                                          size="sm"
                                          type="button"
                                          variant="ghost"
                                          onPress={() => toggleTaskDescription(task.id)}
                                        >
                                          <HugeiconsIcon
                                            icon={MoreHorizontalIcon}
                                            aria-hidden="true"
                                            className="size-[18px] shrink-0 translate-y-px"
                                          />
                                        </Button>
                                      )}

                                      <Button
                                        aria-label={`Add child todo to ${task.title}`}
                                        className={taskRowIconButtonClassName}
                                        isDisabled={isCreatingChild}
                                        isIconOnly
                                        size="sm"
                                        type="button"
                                        variant="ghost"
                                        onPress={() => openChildTaskForm(task.id)}
                                      >
                                        <HugeiconsIcon
                                          icon={Add01Icon}
                                          aria-hidden="true"
                                          className="size-[18px] shrink-0 translate-y-px"
                                        />
                                      </Button>
                                    </div>
                                  </div>
                                </div>

                                <div
                                  data-slot="task-detail"
                                  aria-hidden={!isTaskDetailVisible}
                                  className={cn(
                                    'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out',
                                    isTaskDetailVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                                  )}
                                  {...(!isTaskDetailVisible ? { inert: '' } : {})}
                                >
                                  <div
                                    className={cn(
                                      'min-h-0 transform-gpu overflow-hidden transition-[opacity,transform] duration-150 ease-out',
                                      isTaskDetailVisible
                                        ? 'translate-y-0 opacity-100'
                                        : '-translate-y-1 opacity-0',
                                    )}
                                  >
                                    <div className="flex flex-col gap-2 pb-2 pl-15 pr-8">
                                      {hasDescription && (
                                        <div
                                          className={cn(
                                            'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out',
                                            isDescriptionExpanded || !isTaskDetailVisible
                                              ? 'grid-rows-[1fr]'
                                              : 'grid-rows-[0fr]',
                                          )}
                                        >
                                          <div
                                            className={cn(
                                              'min-h-0 transform-gpu overflow-hidden transition-[opacity,transform] duration-150 ease-out',
                                              isDescriptionExpanded
                                                ? 'translate-y-0 opacity-100'
                                                : '-translate-y-1 opacity-0',
                                            )}
                                          >
                                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                                              {task.description}
                                            </p>
                                          </div>
                                        </div>
                                      )}

                                      {isAddingChild && (
                                        <div
                                          aria-hidden={!isChildFormVisible}
                                          className={cn(
                                            'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out',
                                            isChildFormVisible
                                              ? 'grid-rows-[1fr]'
                                              : 'grid-rows-[0fr]',
                                          )}
                                          {...(!isChildFormVisible ? { inert: '' } : {})}
                                        >
                                          <div
                                            className={cn(
                                              'min-h-0 transform-gpu overflow-hidden transition-[opacity,transform] duration-150 ease-out',
                                              isChildFormVisible
                                                ? 'translate-y-0 opacity-100'
                                                : '-translate-y-1 opacity-0',
                                            )}
                                          >
                                            <form
                                              className="flex items-center gap-2"
                                              onSubmit={(event) => {
                                                void handleCreateChildTask(event, task);
                                              }}
                                            >
                                              <TextField
                                                aria-label={`Child todo for ${task.title}`}
                                                className="min-w-0 flex-1"
                                                fullWidth
                                                isDisabled={isCreatingChild}
                                                value={childTaskTitle}
                                                onChange={setChildTaskTitle}
                                              >
                                                <InputGroup className="h-8 min-h-8" fullWidth>
                                                  <InputGroup.Input placeholder="Add child todo..." />
                                                </InputGroup>
                                              </TextField>
                                              <Button
                                                isDisabled={isCreatingChild}
                                                size="sm"
                                                type="submit"
                                              >
                                                Add
                                              </Button>
                                              <Button
                                                isDisabled={isCreatingChild}
                                                size="sm"
                                                type="button"
                                                variant="ghost"
                                                onPress={closeChildTaskForm}
                                              >
                                                Cancel
                                              </Button>
                                            </form>
                                          </div>
                                        </div>
                                      )}

                                      {hasChildren && (
                                        <div
                                          data-slot="task-children"
                                          aria-hidden={!hasVisibleChildren}
                                          className={cn(
                                            'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out',
                                            hasVisibleChildren || !isTaskDetailVisible
                                              ? 'grid-rows-[1fr]'
                                              : 'grid-rows-[0fr]',
                                          )}
                                          {...(!hasVisibleChildren ? { inert: '' } : {})}
                                        >
                                          <div
                                            className={cn(
                                              'min-h-0 transform-gpu overflow-hidden transition-[opacity,transform] duration-150 ease-out',
                                              hasVisibleChildren
                                                ? 'translate-y-0 opacity-100'
                                                : '-translate-y-1 opacity-0',
                                            )}
                                          >
                                            <div className="flex flex-col">
                                              {taskChildren.map((childTask) => {
                                                const childProjectName = childTask.projectId
                                                  ? projectNameById.get(childTask.projectId)
                                                  : null;
                                                const childDueDate = formatDate(childTask.dueDate);
                                                const isChildDone = childTask.status === 'done';
                                                const isChildUpdating = updatingTaskIds.has(
                                                  childTask.id,
                                                );
                                                const hasChildDescription =
                                                  childTask.description.trim() !== '';
                                                const isChildDescriptionExpanded =
                                                  expandedDescriptionTaskIds.has(childTask.id);

                                                return (
                                                  <div
                                                    key={childTask.id}
                                                    id={childTask.id}
                                                    data-slot="task-child-row"
                                                    className="grid min-h-10 grid-cols-[minmax(0,1fr)_7rem_5rem] items-start"
                                                  >
                                                    <div className="min-w-0 py-1.5 pl-1">
                                                      <div className="flex min-w-0 items-center gap-3">
                                                        {renderTaskCheckbox(
                                                          childTask,
                                                          isChildUpdating,
                                                        )}

                                                        <div className="min-w-0 flex-1">
                                                          <div
                                                            className={cn(
                                                              'min-w-0 truncate text-sm font-medium text-foreground',
                                                              isChildDone &&
                                                                'text-muted-foreground line-through',
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

                                                      {hasChildDescription &&
                                                        isChildDescriptionExpanded && (
                                                          <p className="mt-1 whitespace-pre-wrap pl-8 text-sm leading-relaxed text-muted-foreground">
                                                            {childTask.description}
                                                          </p>
                                                        )}
                                                    </div>

                                                    <div className="px-2 py-2 text-muted-foreground">
                                                      {childDueDate && (
                                                        <span className="flex items-center justify-end gap-1 text-xs tabular-nums">
                                                          <HugeiconsIcon
                                                            icon={Calendar03Icon}
                                                            aria-hidden="true"
                                                            className="size-3 shrink-0"
                                                          />
                                                          {childDueDate}
                                                        </span>
                                                      )}
                                                    </div>

                                                    <div className="py-1.5 text-right">
                                                      {hasChildDescription && (
                                                        <Button
                                                          aria-label={`${isChildDescriptionExpanded ? 'Hide' : 'Show'} notes for ${childTask.title}`}
                                                          className={taskRowIconButtonClassName}
                                                          isIconOnly
                                                          size="sm"
                                                          type="button"
                                                          variant="ghost"
                                                          onPress={() =>
                                                            toggleTaskDescription(childTask.id)
                                                          }
                                                        >
                                                          <HugeiconsIcon
                                                            icon={MoreHorizontalIcon}
                                                            aria-hidden="true"
                                                            className="size-[18px] shrink-0 translate-y-px"
                                                          />
                                                        </Button>
                                                      )}
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </Table.Cell>
                          </Table.Row>
                        );
                      })}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
