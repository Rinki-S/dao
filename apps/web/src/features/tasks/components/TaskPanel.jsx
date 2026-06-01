import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon';
import Calendar03Icon from '@hugeicons/core-free-icons/Calendar03Icon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import Edit02Icon from '@hugeicons/core-free-icons/Edit02Icon';
import TaskDone01Icon from '@hugeicons/core-free-icons/TaskDone01Icon';
import { gsap } from 'gsap';
import {
  Button,
  Checkbox,
  Chip,
  Dropdown,
  FieldError,
  Form,
  InputGroup,
  Label,
  Modal,
  Popover,
  ScrollShadow,
  Skeleton,
  Table,
  TextArea,
  TextField,
} from '@heroui/react';
import { notifyActivityChanged } from '../../activities/events.js';
import { listProjects } from '../../projects/api.js';
import { createTask, deleteTask, listTasks, updateTask, updateTaskStatus } from '../api.js';

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

const childTaskFormAnimationDurationMs = 180;
const disclosureAnimationDuration = 0.16;

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

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function GsapDisclosure({ children, className, contentClassName, dataSlot, isOpen }) {
  const rootRef = useRef(null);
  const contentRef = useRef(null);
  const hasMountedRef = useRef(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;

    if (!root || !content) {
      return undefined;
    }

    gsap.killTweensOf([root, content]);

    if (prefersReducedMotion()) {
      gsap.set(root, {
        height: isOpen ? 'auto' : 0,
        overflow: isOpen ? 'visible' : 'hidden',
      });
      gsap.set(content, {
        autoAlpha: isOpen ? 1 : 0,
        y: isOpen ? 0 : -4,
      });
      hasMountedRef.current = true;
      return undefined;
    }

    if (!hasMountedRef.current) {
      gsap.set(root, {
        height: isOpen ? 'auto' : 0,
        overflow: isOpen ? 'visible' : 'hidden',
      });
      gsap.set(content, {
        autoAlpha: isOpen ? 1 : 0,
        y: isOpen ? 0 : -4,
      });
      hasMountedRef.current = true;
      return undefined;
    }

    if (isOpen) {
      gsap.set(root, { height: 'auto', overflow: 'visible' });
      const openHeight = root.offsetHeight;

      gsap.fromTo(
        root,
        { height: 0, overflow: 'hidden' },
        {
          height: openHeight,
          duration: disclosureAnimationDuration,
          ease: 'power2.out',
          overwrite: 'auto',
          onComplete: () => {
            gsap.set(root, { height: 'auto', overflow: 'visible' });
          },
        },
      );
      gsap.fromTo(
        content,
        { autoAlpha: 0, y: -4 },
        {
          autoAlpha: 1,
          y: 0,
          duration: disclosureAnimationDuration,
          ease: 'power2.out',
          overwrite: 'auto',
        },
      );
    } else {
      gsap.to(content, {
        autoAlpha: 0,
        y: -4,
        duration: 0.12,
        ease: 'power1.out',
        overwrite: 'auto',
      });
      gsap.to(root, {
        height: 0,
        duration: disclosureAnimationDuration,
        ease: 'power1.out',
        overwrite: 'auto',
        onStart: () => {
          gsap.set(root, { overflow: 'hidden' });
        },
      });
    }

    return () => {
      gsap.killTweensOf([root, content]);
    };
  }, [isOpen]);

  return (
    <div
      ref={rootRef}
      data-slot={dataSlot}
      aria-hidden={!isOpen}
      className={`overflow-hidden ${className ?? ''}`}
      {...(!isOpen ? { inert: true } : {})}
    >
      <div
        ref={contentRef}
        className={`min-h-0 transform-gpu overflow-visible [will-change:transform,opacity] ${contentClassName ?? ''}`}
      >
        {children}
      </div>
    </div>
  );
}

function TaskApiErrorMessage({ children, className }) {
  if (!children) {
    return null;
  }

  return (
    <p role="alert" className={`text-sm text-danger ${className ?? ''}`}>
      {children}
    </p>
  );
}

export function TaskPanel({ currentWorkspace }) {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState('medium');
  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [quickAddError, setQuickAddError] = useState('');
  const [taskActionError, setTaskActionError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isDescriptionPopoverOpen, setIsDescriptionPopoverOpen] = useState(false);
  const [updatingTaskIds, setUpdatingTaskIds] = useState(() => new Set());
  const [childTaskParentId, setChildTaskParentId] = useState('');
  const [renderedChildTaskParentId, setRenderedChildTaskParentId] = useState('');
  const [visibleChildTaskParentId, setVisibleChildTaskParentId] = useState('');
  const [childTaskTitle, setChildTaskTitle] = useState('');
  const [childTaskError, setChildTaskError] = useState('');
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState(() => new Set());
  const [taskContextMenu, setTaskContextMenu] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [taskPendingDelete, setTaskPendingDelete] = useState(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDescription, setEditTaskDescription] = useState('');
  const [editTaskPriority, setEditTaskPriority] = useState('medium');
  const [editTaskError, setEditTaskError] = useState('');
  const [isSavingTaskEdit, setIsSavingTaskEdit] = useState(false);
  const [deleteTaskError, setDeleteTaskError] = useState('');
  const [isDeletingTask, setIsDeletingTask] = useState(false);
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

  const taskContextMenuTask = useMemo(() => {
    if (!taskContextMenu) {
      return null;
    }

    return visibleTasks.find((task) => task.id === taskContextMenu.taskId) ?? null;
  }, [taskContextMenu, visibleTasks]);

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

  const taskPendingDeleteChildCount = useMemo(() => {
    if (!taskPendingDelete) {
      return 0;
    }

    return childrenByParentId.get(taskPendingDelete.id)?.length ?? 0;
  }, [childrenByParentId, taskPendingDelete]);

  async function loadTaskData({ showLoading = true } = {}) {
    if (showLoading) {
      setStatus('loading');
    }

    setLoadError('');

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
        setLoadError('');

        const [nextProjects, nextTasks] = await Promise.all([listProjects(), listTasks()]);

        if (cancelled) {
          return;
        }

        setProjects(nextProjects);
        setTasks(nextTasks);
        setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load tasks');
          setStatus('error');
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- The child form keeps separate mounted and visible state so its enter and exit animations can both run. */
  useEffect(() => {
    if (childTaskParentId) {
      setVisibleChildTaskParentId('');
      setRenderedChildTaskParentId(childTaskParentId);

      const frameId = window.requestAnimationFrame(() => {
        setVisibleChildTaskParentId(childTaskParentId);
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    setVisibleChildTaskParentId('');

    const timeoutId = window.setTimeout(() => {
      setRenderedChildTaskParentId('');
    }, childTaskFormAnimationDurationMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [childTaskParentId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleProjectChange(nextProjectId) {
    setSelectedProjectId(nextProjectId === 'none' ? '' : nextProjectId);
  }

  async function handleCreateTask(event) {
    event.preventDefault();

    if (!currentWorkspace) {
      setQuickAddError('Create a workspace before adding tasks');
      return;
    }

    if (taskTitle.trim() === '') {
      setQuickAddError('');
      return;
    }

    try {
      setIsCreating(true);
      setQuickAddError('');
      setTaskActionError('');

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
      setQuickAddError(err instanceof Error ? err.message : 'Failed to create task');
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
    setQuickAddError('');
    taskTitleInputRef.current?.blur();
  }

  async function handleToggleTaskDone(task) {
    const nextStatus = task.status === 'done' ? 'todo' : 'done';

    setUpdatingTaskIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(task.id);
      return nextIds;
    });
    setTaskActionError('');

    try {
      await updateTaskStatus(task.id, { status: nextStatus });
      await loadTaskData({ showLoading: false });
    } catch (err) {
      setTaskActionError(err instanceof Error ? err.message : 'Failed to update task');
    } finally {
      setUpdatingTaskIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(task.id);
        return nextIds;
      });
    }
  }

  function openChildTaskForm(parentTaskId) {
    setExpandedTaskIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(parentTaskId);
      return nextIds;
    });
    setChildTaskParentId(parentTaskId);
    setChildTaskTitle('');
    setChildTaskError('');
  }

  function closeChildTaskForm() {
    setChildTaskParentId('');
    setChildTaskTitle('');
    setChildTaskError('');
  }

  async function handleCreateChildTask(event, parentTask) {
    event.preventDefault();

    if (!currentWorkspace) {
      setChildTaskError('Create a workspace before adding tasks');
      return;
    }

    try {
      setIsCreatingChild(true);
      setChildTaskError('');

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
      await loadTaskData({ showLoading: false });
      notifyActivityChanged();
    } catch (err) {
      setChildTaskError(err instanceof Error ? err.message : 'Failed to create child task');
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

  function toggleTaskDetails(taskId) {
    setExpandedTaskIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(taskId)) {
        nextIds.delete(taskId);
      } else {
        nextIds.add(taskId);
      }

      return nextIds;
    });
  }

  function openTaskContextMenu(event, task) {
    event.preventDefault();
    event.stopPropagation();
    setTaskContextMenu({
      taskId: task.id,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function closeTaskContextMenu() {
    setTaskContextMenu(null);
  }

  function openEditTaskDialog(task) {
    closeTaskContextMenu();
    setEditingTask(task);
    setEditTaskTitle(task.title);
    setEditTaskDescription(task.description);
    setEditTaskPriority(task.priority);
    setEditTaskError('');
  }

  function closeEditTaskDialog() {
    if (isSavingTaskEdit) {
      return;
    }

    setEditingTask(null);
    setEditTaskTitle('');
    setEditTaskDescription('');
    setEditTaskPriority('medium');
    setEditTaskError('');
  }

  function openDeleteTaskDialog(task) {
    closeTaskContextMenu();
    setTaskPendingDelete(task);
    setDeleteTaskError('');
  }

  function closeDeleteTaskDialog() {
    if (isDeletingTask) {
      return;
    }

    setTaskPendingDelete(null);
    setDeleteTaskError('');
  }

  async function handleSaveTaskEdit(event) {
    event.preventDefault();

    if (!editingTask) {
      return;
    }

    if (editTaskTitle.trim() === '') {
      setEditTaskError('');
      return;
    }

    try {
      setIsSavingTaskEdit(true);
      setEditTaskError('');

      await updateTask(editingTask.id, {
        title: editTaskTitle,
        description: editTaskDescription,
        priority: editTaskPriority,
        dueDate: editingTask.dueDate,
        projectId: editingTask.projectId,
      });

      setEditingTask(null);
      await loadTaskData({ showLoading: false });
      notifyActivityChanged();
    } catch (err) {
      setEditTaskError(err instanceof Error ? err.message : 'Failed to update task');
    } finally {
      setIsSavingTaskEdit(false);
    }
  }

  async function handleConfirmDeleteTask() {
    if (!taskPendingDelete) {
      return;
    }

    setDeleteTaskError('');

    try {
      setIsDeletingTask(true);

      await deleteTask(taskPendingDelete.id);
      setTaskPendingDelete(null);
      await loadTaskData({ showLoading: false });
      notifyActivityChanged();
    } catch (err) {
      setDeleteTaskError(err instanceof Error ? err.message : 'Failed to delete task');
    } finally {
      setIsDeletingTask(false);
    }
  }

  function handleTaskContextMenuAction(actionKey) {
    if (!taskContextMenuTask) {
      return;
    }

    if (actionKey === 'edit') {
      openEditTaskDialog(taskContextMenuTask);
      return;
    }

    if (actionKey === 'delete') {
      openDeleteTaskDialog(taskContextMenuTask);
    }
  }

  return (
    <section id="tasks" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Form
        className="flex shrink-0 flex-col gap-3 px-8 py-4"
        validationBehavior="native"
        onSubmit={handleCreateTask}
        onKeyDown={handleQuickAddKeyDown}
      >
        <div className="flex w-full flex-col gap-3">
          <TextField
            className="w-full min-w-0"
            fullWidth
            isDisabled={!currentWorkspace || isCreating}
            isRequired
            name="task-title"
            validate={(value) => (value.trim() ? null : 'Task title is required')}
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
                        <span className={isPressed ? 'scale-[0.97]' : undefined}>
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
                        <span className={isPressed ? 'scale-[0.97]' : undefined}>
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
                    <Button
                      aria-label="Edit description"
                      className={quickAddAccessoryButtonClassName}
                      isDisabled={!currentWorkspace || isCreating}
                      size="sm"
                      variant="ghost"
                    >
                      {taskDescription.trim() ? 'Description' : 'No description'}
                    </Button>
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
            <FieldError />
          </TextField>

          <TaskApiErrorMessage>{quickAddError || taskActionError}</TaskApiErrorMessage>
        </div>
      </Form>

      <div className="min-h-0 flex-1">
        <ScrollShadow className="h-full min-h-0" orientation="vertical" size={20}>
          {status === 'loading' && (
            <div className="flex flex-col gap-4 px-8 py-6">
              <div className="flex items-center gap-3">
                <Skeleton className="size-5 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="size-7 rounded" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="size-5 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3 rounded" />
                  <Skeleton className="h-3 w-2/5 rounded" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="size-7 rounded" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="size-5 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-4/5 rounded" />
                  <Skeleton className="h-3 w-1/3 rounded" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="size-7 rounded" />
              </div>
            </div>
          )}

          {status === 'error' && (
            <TaskApiErrorMessage className="px-8">{loadError}</TaskApiErrorMessage>
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
                        const isRenderingChildForm = renderedChildTaskParentId === task.id;
                        const hasChildren = taskChildren.length > 0;
                        const isExpanded = expandedTaskIds.has(task.id);
                        const hasDescription = task.description.trim() !== '';
                        const hasVisibleChildren = hasChildren && isExpanded;
                        const isChildFormVisible =
                          visibleChildTaskParentId === task.id && isExpanded;
                        const canShowTaskDetails =
                          hasDescription || hasChildren || isRenderingChildForm;
                        const isTaskDetailVisible = isExpanded && canShowTaskDetails;
                        const completedChildCount = taskChildren.filter(
                          (childTask) => childTask.status === 'done',
                        ).length;

                        return (
                          <Table.Row key={task.id} id={task.id}>
                            <Table.Cell className="p-0" colSpan={3}>
                              <div
                                data-slot="task-row-layout"
                                className="flex min-w-0 flex-col"
                                onContextMenu={(event) => openTaskContextMenu(event, task)}
                              >
                                <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_7rem_5rem] items-center">
                                  <div className="relative min-w-0 py-1.5 pl-4">
                                    <div className="flex min-w-0 items-center gap-3">
                                      {renderTaskCheckbox(task, isUpdating)}

                                      <Button
                                        aria-expanded={canShowTaskDetails ? isExpanded : undefined}
                                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${task.title}`}
                                        className={`min-w-0 flex-1 transform-gpu justify-start rounded-md px-2 py-1.5 text-left transition-[background-color,scale] duration-150 ease-out active:scale-[0.96] data-[pressed=true]:scale-[0.96] ${canShowTaskDetails ? 'hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-focus' : 'pointer-events-none opacity-100'}`}
                                        data-slot="task-details-trigger"
                                        aria-disabled={!canShowTaskDetails}
                                        type="button"
                                        variant="ghost"
                                        onPress={() => {
                                          if (canShowTaskDetails) {
                                            toggleTaskDetails(task.id);
                                          }
                                        }}
                                      >
                                        <div className="flex min-w-0 items-center gap-2">
                                          <div
                                            className={`min-w-0 truncate text-sm font-medium ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}
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
                                          {hasDescription && (
                                            <span className="shrink-0 text-xs font-normal text-muted-foreground">
                                              Note
                                            </span>
                                          )}
                                          {hasChildren && (
                                            <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
                                              {completedChildCount}/{taskChildren.length}
                                            </span>
                                          )}
                                        </div>
                                      </Button>
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

                                  <div className="pr-4 text-right">
                                    <div className="flex justify-end gap-1">
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

                                <GsapDisclosure dataSlot="task-detail" isOpen={isTaskDetailVisible}>
                                  <div className="flex flex-col gap-2 pb-2 pl-15 pr-8">
                                    {hasDescription && (
                                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                                        {task.description}
                                      </p>
                                    )}

                                    {isRenderingChildForm && (
                                      <GsapDisclosure
                                        className="overflow-visible"
                                        contentClassName="px-0.5 py-0.5"
                                        dataSlot="task-child-form"
                                        isOpen={isChildFormVisible}
                                      >
                                        <Form
                                          className="flex flex-col gap-2"
                                          validationBehavior="native"
                                          onSubmit={(event) => {
                                            void handleCreateChildTask(event, task);
                                          }}
                                        >
                                          <div className="flex items-center gap-2">
                                            <TextField
                                              aria-label={`Child todo for ${task.title}`}
                                              className="min-w-0 flex-1"
                                              fullWidth
                                              isDisabled={isCreatingChild}
                                              isRequired
                                              name={`child-task-title-${task.id}`}
                                              validate={(value) =>
                                                value.trim() ? null : 'Child todo title is required'
                                              }
                                              value={childTaskTitle}
                                              onChange={setChildTaskTitle}
                                            >
                                              <InputGroup
                                                className="h-8 min-h-8 shadow-none"
                                                fullWidth
                                              >
                                                <InputGroup.Input placeholder="Add child todo..." />
                                              </InputGroup>
                                              <FieldError />
                                            </TextField>
                                            <Button
                                              isDisabled={
                                                isCreatingChild || childTaskTitle.trim() === ''
                                              }
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
                                          </div>
                                          <TaskApiErrorMessage>
                                            {childTaskError}
                                          </TaskApiErrorMessage>
                                        </Form>
                                      </GsapDisclosure>
                                    )}

                                    {hasVisibleChildren && (
                                      <div
                                        data-slot="task-children"
                                        aria-hidden={!hasVisibleChildren}
                                        className="overflow-visible"
                                        {...(!hasVisibleChildren ? { inert: true } : {})}
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
                                            return (
                                              <div
                                                key={childTask.id}
                                                id={childTask.id}
                                                data-slot="task-child-row"
                                                className="grid min-h-10 grid-cols-[minmax(0,1fr)_7rem_5rem] items-start"
                                                onContextMenu={(event) =>
                                                  openTaskContextMenu(event, childTask)
                                                }
                                              >
                                                <div className="min-w-0 py-1.5 pl-1">
                                                  <div className="flex min-w-0 items-center gap-3">
                                                    {renderTaskCheckbox(childTask, isChildUpdating)}

                                                    <div className="min-w-0 flex-1">
                                                      <div
                                                        className={`min-w-0 truncate text-sm font-medium ${isChildDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}
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

                                                  {childTask.description.trim() !== '' && (
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

                                                <div className="py-1.5 text-right" />
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </GsapDisclosure>
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
        </ScrollShadow>
      </div>

      <Dropdown
        isOpen={Boolean(taskContextMenu && taskContextMenuTask)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeTaskContextMenu();
          }
        }}
      >
        <Button
          aria-label="Task context menu"
          className="fixed z-50 size-px opacity-0"
          isIconOnly
          style={{
            left: taskContextMenu?.x ?? 0,
            top: taskContextMenu?.y ?? 0,
          }}
          type="button"
          variant="ghost"
        >
          <span className="sr-only">Task context menu</span>
        </Button>
        <Dropdown.Popover className="w-40" placement="bottom start">
          <Dropdown.Menu aria-label="Task actions" onAction={handleTaskContextMenuAction}>
            <Dropdown.Item id="edit" textValue="Edit">
              <HugeiconsIcon icon={Edit02Icon} aria-hidden="true" className="size-4" />
              <Label>Edit</Label>
            </Dropdown.Item>
            <Dropdown.Item
              id="delete"
              className="hover:bg-danger-soft-hover data-[hovered=true]:bg-danger-soft-hover data-[pressed=true]:bg-danger-soft-hover"
              textValue="Delete"
              variant="danger"
            >
              <HugeiconsIcon
                icon={Delete02Icon}
                aria-hidden="true"
                className="size-4 text-danger"
              />
              <Label>Delete</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      <Modal
        isOpen={Boolean(editingTask)}
        onOpenChange={(isOpen) => !isOpen && closeEditTaskDialog()}
      >
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog aria-label="Edit task">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>Edit task</Modal.Heading>
              </Modal.Header>

              <Form validationBehavior="native" onSubmit={handleSaveTaskEdit}>
                <Modal.Body className="flex flex-col gap-3">
                  <TextField
                    fullWidth
                    isDisabled={isSavingTaskEdit}
                    isRequired
                    name="edit-task-title"
                    validate={(value) => (value.trim() ? null : 'Task title is required')}
                    value={editTaskTitle}
                    onChange={setEditTaskTitle}
                  >
                    <Label htmlFor="edit-task-title">Title</Label>
                    <InputGroup fullWidth>
                      <InputGroup.Input id="edit-task-title" />
                    </InputGroup>
                    <FieldError />
                  </TextField>

                  <TextField
                    fullWidth
                    isDisabled={isSavingTaskEdit}
                    name="edit-task-description"
                    value={editTaskDescription}
                    onChange={setEditTaskDescription}
                  >
                    <Label>Description</Label>
                    <TextArea
                      fullWidth
                      className="max-h-48 min-h-28 resize-none overflow-y-auto"
                      variant="secondary"
                    />
                  </TextField>

                  <Dropdown>
                    <Button
                      className="justify-between"
                      fullWidth
                      isDisabled={isSavingTaskEdit}
                      type="button"
                      variant="secondary"
                    >
                      Priority: {priorityLabels[editTaskPriority]}
                    </Button>
                    <Dropdown.Popover className="w-40" placement="bottom start">
                      <Dropdown.Menu
                        selectedKeys={new Set([editTaskPriority])}
                        selectionMode="single"
                        onSelectionChange={(keys) => {
                          const [nextPriority] = [...keys];
                          if (nextPriority) {
                            setEditTaskPriority(String(nextPriority));
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

                  <TaskApiErrorMessage>{editTaskError}</TaskApiErrorMessage>
                </Modal.Body>

                <Modal.Footer>
                  <Button isDisabled={isSavingTaskEdit} isPending={isSavingTaskEdit} type="submit">
                    {isSavingTaskEdit ? 'Saving...' : 'Save'}
                  </Button>
                </Modal.Footer>
              </Form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal
        isOpen={Boolean(taskPendingDelete)}
        onOpenChange={(isOpen) => !isOpen && closeDeleteTaskDialog()}
      >
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog aria-label="Delete task">
              <Modal.Header>
                <Modal.Heading>Delete task?</Modal.Heading>
              </Modal.Header>

              <Modal.Body>
                <p>
                  This will delete{' '}
                  <span className="font-medium text-foreground">{taskPendingDelete?.title}</span>
                  {taskPendingDeleteChildCount > 0 ? (
                    <>
                      {' '}
                      and {taskPendingDeleteChildCount} child{' '}
                      {taskPendingDeleteChildCount === 1 ? 'todo' : 'todos'}.
                    </>
                  ) : (
                    '.'
                  )}
                </p>
                <TaskApiErrorMessage>{deleteTaskError}</TaskApiErrorMessage>
              </Modal.Body>

              <Modal.Footer>
                <Button
                  isDisabled={isDeletingTask}
                  type="button"
                  variant="tertiary"
                  onPress={closeDeleteTaskDialog}
                >
                  Cancel
                </Button>
                <Button
                  isPending={isDeletingTask}
                  type="button"
                  variant="danger"
                  onPress={() => {
                    void handleConfirmDeleteTask();
                  }}
                >
                  {isDeletingTask ? 'Deleting...' : 'Delete'}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </section>
  );
}
