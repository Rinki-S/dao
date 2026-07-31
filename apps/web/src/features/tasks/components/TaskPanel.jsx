import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconCalendar, IconChecklist, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { gsap } from 'gsap';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
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
      className={cn('overflow-hidden', className)}
      {...(!isOpen ? { inert: true } : {})}
    >
      <div
        ref={contentRef}
        className={cn(
          'min-h-0 transform-gpu overflow-visible [will-change:transform,opacity]',
          contentClassName,
        )}
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
    <p role="alert" className={cn('text-sm text-destructive', className)}>
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

  const projectOptions = useMemo(() => {
    return [
      { label: 'No project', value: 'none' },
      ...workspaceProjects.map((project) => ({
        label: project.name,
        value: project.id,
      })),
    ];
  }, [workspaceProjects]);

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

  function renderTaskCheckbox(task, disabled) {
    const checkboxState = getCheckboxState(task);

    return (
      <Checkbox
        aria-label={`Toggle ${task.title}`}
        checked={checkboxState === true}
        disabled={disabled}
        indeterminate={checkboxState === 'indeterminate'}
        onCheckedChange={() => {
          void handleToggleTaskDone(task);
        }}
      />
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

  function openEditTaskDialog(task) {
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

  function renderTaskContextMenu(task) {
    return (
      <ContextMenuContent className="w-40">
        <ContextMenuGroup>
          <ContextMenuItem onClick={() => openEditTaskDialog(task)}>
            <IconEdit aria-hidden="true" />
            Edit
          </ContextMenuItem>
          <ContextMenuItem variant="destructive" onClick={() => openDeleteTaskDialog(task)}>
            <IconTrash aria-hidden="true" />
            Delete
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    );
  }

  return (
    <section id="tasks" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <form
        className="flex shrink-0 flex-col gap-3 px-8 py-4"
        onSubmit={handleCreateTask}
        onKeyDown={handleQuickAddKeyDown}
      >
        <FieldGroup className="gap-3">
          <Field data-disabled={!currentWorkspace || isCreating}>
            <FieldLabel className="sr-only" htmlFor="task-title">
              Task title
            </FieldLabel>
            <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row">
              <InputGroup className="w-full min-w-0 flex-1">
                <InputGroupInput
                  id="task-title"
                  ref={taskTitleInputRef}
                  data-command-target="task-title"
                  disabled={!currentWorkspace || isCreating}
                  name="task-title"
                  placeholder="Add a task..."
                  required
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                />

                <InputGroupAddon align="inline-end" className="gap-1 pr-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <InputGroupButton
                          aria-label="Select project"
                          disabled={!currentWorkspace || isCreating}
                        />
                      }
                    >
                      {selectedWorkspaceProjectId
                        ? (projectNameById.get(selectedWorkspaceProjectId) ?? 'Project')
                        : 'No project'}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuGroup>
                        <DropdownMenuRadioGroup
                          value={selectedWorkspaceProjectId || 'none'}
                          onValueChange={handleProjectChange}
                        >
                          {projectOptions.map((option) => (
                            <DropdownMenuRadioItem
                              closeOnClick
                              key={option.value}
                              value={option.value}
                            >
                              {option.label}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <InputGroupButton
                          aria-label="Select priority"
                          disabled={!currentWorkspace || isCreating}
                        />
                      }
                    >
                      {priorityLabels[taskPriority]}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuGroup>
                        <DropdownMenuRadioGroup
                          value={taskPriority}
                          onValueChange={setTaskPriority}
                        >
                          {priorityOptions.map((option) => (
                            <DropdownMenuRadioItem
                              closeOnClick
                              key={option.value}
                              value={option.value}
                            >
                              {option.label}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Popover
                    open={isDescriptionPopoverOpen}
                    onOpenChange={setIsDescriptionPopoverOpen}
                  >
                    <PopoverTrigger
                      render={
                        <InputGroupButton
                          aria-label="Edit description"
                          disabled={!currentWorkspace || isCreating}
                        />
                      }
                    >
                      {taskDescription.trim() ? 'Description' : 'No description'}
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="w-80"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <PopoverTitle>Description</PopoverTitle>
                      <Field data-disabled={!currentWorkspace || isCreating}>
                        <FieldLabel className="sr-only" htmlFor="task-description">
                          Description
                        </FieldLabel>
                        <Textarea
                          id="task-description"
                          className="max-h-48 min-h-28 resize-none overflow-y-auto"
                          disabled={!currentWorkspace || isCreating}
                          placeholder="Add details..."
                          value={taskDescription}
                          onChange={(event) => setTaskDescription(event.target.value)}
                        />
                      </Field>
                    </PopoverContent>
                  </Popover>
                </InputGroupAddon>
              </InputGroup>

              <Button
                className="h-9 shrink-0"
                disabled={isCreating || !currentWorkspace || taskTitle.trim() === ''}
                type="submit"
              >
                {isCreating && <Spinner data-icon="inline-start" />}
                {isCreating ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </Field>

          <TaskApiErrorMessage>{quickAddError || taskActionError}</TaskApiErrorMessage>
        </FieldGroup>
      </form>

      <div className="min-h-0 flex-1">
        <ScrollArea className="h-full min-h-0">
          {status === 'loading' && (
            <div className="flex flex-col gap-4 px-8 py-6">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-3">
                  <Skeleton className="size-5" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className={row === 1 ? 'h-4 w-2/3' : 'h-4 w-3/4'} />
                    <Skeleton className={row === 2 ? 'h-3 w-1/3' : 'h-3 w-1/2'} />
                  </div>
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="size-7" />
                </div>
              ))}
            </div>
          )}

          {status === 'error' && (
            <TaskApiErrorMessage className="px-8 py-6">{loadError}</TaskApiErrorMessage>
          )}

          {status === 'ready' && !currentWorkspace && (
            <Empty className="mx-8 min-h-40 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconChecklist aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No workspace selected</EmptyTitle>
                <EmptyDescription>Create a workspace before adding tasks.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {status === 'ready' && currentWorkspace && visibleTasks.length === 0 && (
            <Empty className="mx-8 min-h-40 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconChecklist aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No tasks yet</EmptyTitle>
                <EmptyDescription>
                  Capture the next concrete action for this workspace.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {status === 'ready' &&
            currentWorkspace &&
            visibleTasks.length > 0 &&
            parentTasks.length === 0 && (
              <Empty className="mx-8 min-h-32 border">
                <EmptyHeader>
                  <EmptyTitle>No tasks match this filter</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}

          {status === 'ready' && parentTasks.length > 0 && (
            <div className="px-8">
              <Table aria-label="Tasks" className="border-b">
                <TableHeader className="sr-only">
                  <TableRow>
                    <TableHead scope="col">Task</TableHead>
                    <TableHead scope="col">Due</TableHead>
                    <TableHead scope="col">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parentTasks.map((task) => {
                    const taskChildren = childrenByParentId.get(task.id) ?? [];
                    const projectName = task.projectId ? projectNameById.get(task.projectId) : null;
                    const dueDate = formatDate(task.dueDate);
                    const isDone = task.status === 'done';
                    const isUpdating = updatingTaskIds.has(task.id);
                    const isRenderingChildForm = renderedChildTaskParentId === task.id;
                    const hasChildren = taskChildren.length > 0;
                    const isExpanded = expandedTaskIds.has(task.id);
                    const hasDescription = task.description.trim() !== '';
                    const hasVisibleChildren = hasChildren && isExpanded;
                    const isChildFormVisible = visibleChildTaskParentId === task.id && isExpanded;
                    const canShowTaskDetails =
                      hasDescription || hasChildren || isRenderingChildForm;
                    const isTaskDetailVisible = isExpanded && canShowTaskDetails;
                    const completedChildCount = taskChildren.filter(
                      (childTask) => childTask.status === 'done',
                    ).length;

                    return (
                      <TableRow key={task.id} id={task.id}>
                        <TableCell className="p-0" colSpan={3}>
                          <div data-slot="task-row-layout" className="flex min-w-0 flex-col">
                            <ContextMenu>
                              <ContextMenuTrigger className="grid min-h-11 grid-cols-[minmax(0,1fr)_7rem_5rem] items-center">
                                <div className="relative min-w-0 py-1.5 pl-4">
                                  <div className="flex min-w-0 items-center gap-3">
                                    {renderTaskCheckbox(task, isUpdating)}

                                    <Button
                                      aria-expanded={canShowTaskDetails ? isExpanded : undefined}
                                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${task.title}`}
                                      className="min-w-0 flex-1 transform-gpu justify-start px-2 py-1.5 text-left transition-[background-color,scale] duration-150 ease-out active:scale-[0.96] data-pressed:scale-[0.96]"
                                      data-slot="task-details-trigger"
                                      disabled={!canShowTaskDetails}
                                      type="button"
                                      variant="ghost"
                                      onClick={() => toggleTaskDetails(task.id)}
                                    >
                                      <div className="flex min-w-0 items-center gap-2">
                                        <div
                                          className={cn(
                                            'min-w-0 truncate text-sm font-medium',
                                            isDone
                                              ? 'text-muted-foreground line-through'
                                              : 'text-foreground',
                                          )}
                                        >
                                          {task.title}
                                          {projectName && (
                                            <span className="font-normal text-muted-foreground">
                                              /{projectName}
                                            </span>
                                          )}
                                        </div>
                                        <Badge
                                          variant={
                                            task.priority === 'high' ? 'default' : 'secondary'
                                          }
                                        >
                                          {priorityLabels[task.priority]}
                                        </Badge>
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
                                      <IconCalendar
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
                                      disabled={isCreatingChild}
                                      size="icon-sm"
                                      type="button"
                                      variant="ghost"
                                      onClick={() => openChildTaskForm(task.id)}
                                    >
                                      <IconPlus data-icon="inline-start" aria-hidden="true" />
                                    </Button>
                                  </div>
                                </div>
                              </ContextMenuTrigger>
                              {renderTaskContextMenu(task)}
                            </ContextMenu>

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
                                    <form
                                      className="flex flex-col gap-2"
                                      onSubmit={(event) => {
                                        void handleCreateChildTask(event, task);
                                      }}
                                    >
                                      <FieldGroup className="gap-2">
                                        <Field
                                          data-disabled={isCreatingChild}
                                          orientation="horizontal"
                                        >
                                          <FieldLabel
                                            className="sr-only"
                                            htmlFor={`child-task-title-${task.id}`}
                                          >
                                            Child todo for {task.title}
                                          </FieldLabel>
                                          <InputGroup className="h-8 min-h-8 shadow-none">
                                            <InputGroupInput
                                              id={`child-task-title-${task.id}`}
                                              aria-label={`Child todo for ${task.title}`}
                                              disabled={isCreatingChild}
                                              name={`child-task-title-${task.id}`}
                                              placeholder="Add child todo..."
                                              required
                                              value={childTaskTitle}
                                              onChange={(event) =>
                                                setChildTaskTitle(event.target.value)
                                              }
                                            />
                                          </InputGroup>
                                          <Button
                                            disabled={
                                              isCreatingChild || childTaskTitle.trim() === ''
                                            }
                                            size="sm"
                                            type="submit"
                                          >
                                            {isCreatingChild && (
                                              <Spinner data-icon="inline-start" />
                                            )}
                                            {isCreatingChild ? 'Adding...' : 'Add'}
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
                                        </Field>
                                        <TaskApiErrorMessage>{childTaskError}</TaskApiErrorMessage>
                                      </FieldGroup>
                                    </form>
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
                                        const isChildUpdating = updatingTaskIds.has(childTask.id);

                                        return (
                                          <ContextMenu key={childTask.id}>
                                            <ContextMenuTrigger
                                              id={childTask.id}
                                              data-slot="task-child-row"
                                              className="grid min-h-10 grid-cols-[minmax(0,1fr)_7rem_5rem] items-start"
                                            >
                                              <div className="min-w-0 py-1.5 pl-1">
                                                <div className="flex min-w-0 items-center gap-3">
                                                  {renderTaskCheckbox(childTask, isChildUpdating)}

                                                  <div className="min-w-0 flex-1">
                                                    <div
                                                      className={cn(
                                                        'min-w-0 truncate text-sm font-medium',
                                                        isChildDone
                                                          ? 'text-muted-foreground line-through'
                                                          : 'text-foreground',
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

                                                {childTask.description.trim() !== '' && (
                                                  <p className="mt-1 whitespace-pre-wrap pl-8 text-sm leading-relaxed text-muted-foreground">
                                                    {childTask.description}
                                                  </p>
                                                )}
                                              </div>

                                              <div className="px-2 py-2 text-muted-foreground">
                                                {childDueDate && (
                                                  <span className="flex items-center justify-end gap-1 text-xs tabular-nums">
                                                    <IconCalendar
                                                      aria-hidden="true"
                                                      className="size-3 shrink-0"
                                                    />
                                                    {childDueDate}
                                                  </span>
                                                )}
                                              </div>

                                              <div className="py-1.5 text-right" />
                                            </ContextMenuTrigger>
                                            {renderTaskContextMenu(childTask)}
                                          </ContextMenu>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </GsapDisclosure>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </ScrollArea>
      </div>

      <Dialog
        open={Boolean(editingTask)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeEditTaskDialog();
          }
        }}
      >
        <DialogContent aria-label="Edit task">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
          </DialogHeader>

          <form className="flex flex-col gap-4" onSubmit={handleSaveTaskEdit}>
            <FieldGroup>
              <Field data-disabled={isSavingTaskEdit}>
                <FieldLabel htmlFor="edit-task-title">Title</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="edit-task-title"
                    disabled={isSavingTaskEdit}
                    name="edit-task-title"
                    required
                    value={editTaskTitle}
                    onChange={(event) => setEditTaskTitle(event.target.value)}
                  />
                </InputGroup>
              </Field>

              <Field data-disabled={isSavingTaskEdit}>
                <FieldLabel htmlFor="edit-task-description">Description</FieldLabel>
                <Textarea
                  id="edit-task-description"
                  className="max-h-48 min-h-28 resize-none overflow-y-auto"
                  disabled={isSavingTaskEdit}
                  name="edit-task-description"
                  value={editTaskDescription}
                  onChange={(event) => setEditTaskDescription(event.target.value)}
                />
              </Field>

              <Field data-disabled={isSavingTaskEdit}>
                <FieldLabel htmlFor="edit-task-priority">Priority</FieldLabel>
                <Select
                  id="edit-task-priority"
                  disabled={isSavingTaskEdit}
                  items={priorityOptions}
                  value={editTaskPriority}
                  onValueChange={setEditTaskPriority}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {priorityOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            <TaskApiErrorMessage>{editTaskError}</TaskApiErrorMessage>

            <DialogFooter>
              <Button disabled={isSavingTaskEdit} type="submit">
                {isSavingTaskEdit && <Spinner data-icon="inline-start" />}
                {isSavingTaskEdit ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(taskPendingDelete)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeDeleteTaskDialog();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task</AlertDialogTitle>
            <AlertDialogDescription>
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
            </AlertDialogDescription>
          </AlertDialogHeader>

          <TaskApiErrorMessage>{deleteTaskError}</TaskApiErrorMessage>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeletingTask}
              type="button"
              onClick={closeDeleteTaskDialog}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingTask}
              type="button"
              variant="destructive"
              onClick={() => {
                void handleConfirmDeleteTask();
              }}
            >
              {isDeletingTask && <Spinner data-icon="inline-start" />}
              {isDeletingTask ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
