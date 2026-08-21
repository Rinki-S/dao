import { useMemo, useState } from 'react';
import {
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconEdit,
  IconFlag,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Checkbox } from '@/components/ui/checkbox.jsx';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu.jsx';
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog.jsx';
import { Field, FieldLabel } from '@/components/ui/field.jsx';
import { Input } from '@/components/ui/input.jsx';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { cn } from '@/lib/utils.js';

const PRIORITIES = [
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
];

function TaskFormDialog({ model, open, onOpenChange, parentId = null, task = null }) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState(task?.priority ?? 'medium');
  const [projectId, setProjectId] = useState(task?.projectId ?? 'none');
  const [dueDate, setDueDate] = useState(task?.dueDate?.slice(0, 10) ?? '');
  const projectOptions = [
    { label: 'Workspace root', value: 'none' },
    ...model.projects.map((project) => ({ label: project.name, value: project.id })),
  ];

  async function submit(event) {
    event.preventDefault();
    if (!title.trim()) return;
    const input = {
      title,
      description,
      priority,
      projectId: projectId === 'none' ? null : projectId,
      dueDate: dueDate || null,
    };
    if (task) {
      await model.patchTask(task.id, input);
    } else {
      await model.addTask({ ...input, parentId });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="dao-corner sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit task' : parentId ? 'New subtask' : 'New task'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogPanel className="grid gap-4">
            <Field>
              <FieldLabel>Title</FieldLabel>
              <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Description</FieldLabel>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Folder</FieldLabel>
                <Select items={projectOptions} value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup alignItemWithTrigger={false} className="dao-corner">
                    {projectOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Priority</FieldLabel>
                <Select items={PRIORITIES} value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup alignItemWithTrigger={false} className="dao-corner">
                    {PRIORITIES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel>Due date</FieldLabel>
              <Input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit">{task ? 'Save changes' : 'Create task'}</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function TaskRow({ model, task, children }) {
  const [expanded, setExpanded] = useState(true);
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const folder = model.projects.find((project) => project.id === task.projectId);
  return (
    <div className="dao-task-group">
      <ContextMenu>
        <ContextMenuTrigger>
          <button
            className={cn(
              'dao-task-row dao-corner',
              model.selectedTask?.id === task.id && 'dao-task-row--active',
              task.status === 'done' && 'dao-task-row--done',
            )}
            type="button"
            onClick={() => model.openEntity(task)}
          >
            <span
              className="dao-task-disclosure"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {children.length > 0 ? (
                expanded ? (
                  <IconChevronDown aria-hidden="true" />
                ) : (
                  <IconChevronRight aria-hidden="true" />
                )
              ) : null}
            </span>
            <span onClick={(event) => event.stopPropagation()}>
              <Checkbox
                aria-label={`Mark ${task.title} ${task.status === 'done' ? 'incomplete' : 'complete'}`}
                checked={task.status === 'done'}
                onCheckedChange={() => model.toggleTask(task)}
              />
            </span>
            <span className="dao-task-title">{task.title}</span>
            {folder ? <span className="dao-task-folder">{folder.name}</span> : null}
            <span className={`dao-task-priority dao-task-priority--${task.priority}`}>
              <IconFlag aria-hidden="true" /> {task.priority}
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuPopup className="dao-corner">
          <ContextMenuItem onClick={() => setSubtaskOpen(true)}>
            <IconPlus aria-hidden="true" /> Add subtask
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setEditOpen(true)}>
            <IconEdit aria-hidden="true" /> Edit task
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <IconTrash aria-hidden="true" /> Delete
          </ContextMenuItem>
        </ContextMenuPopup>
      </ContextMenu>
      {expanded && children.length > 0 ? (
        <div className="dao-subtask-list">
          {children.map((child) => (
            <button
              key={child.id}
              className={cn(
                'dao-subtask-row dao-corner',
                model.selectedTask?.id === child.id && 'dao-task-row--active',
              )}
              type="button"
              onClick={() => model.openEntity(child)}
            >
              <span onClick={(event) => event.stopPropagation()}>
                <Checkbox
                  checked={child.status === 'done'}
                  onCheckedChange={() => model.toggleTask(child)}
                />
              </span>
              <span>{child.title}</span>
              <span className={`dao-task-priority dao-task-priority--${child.priority}`}>
                {child.priority}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {subtaskOpen ? (
        <TaskFormDialog
          model={model}
          open={subtaskOpen}
          parentId={task.id}
          onOpenChange={setSubtaskOpen}
        />
      ) : null}
      {editOpen ? (
        <TaskFormDialog model={model} open={editOpen} task={task} onOpenChange={setEditOpen} />
      ) : null}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogPopup className="dao-corner sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{task.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This also removes its subtasks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={() => model.removeTask(task)}
            >
              Delete task
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}

export function TasksWorkspace({ model }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const parents = useMemo(
    () => model.tasks.filter((task) => task.parentId === null),
    [model.tasks],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map();
    for (const task of model.tasks) {
      if (!task.parentId) continue;
      const items = map.get(task.parentId) ?? [];
      items.push(task);
      map.set(task.parentId, items);
    }
    return map;
  }, [model.tasks]);

  async function quickAdd(event) {
    event.preventDefault();
    if (!quickTitle.trim()) return;
    await model.addTask({ title: quickTitle });
    setQuickTitle('');
  }

  return (
    <section className="dao-surface dao-tasks-workspace">
      <header className="dao-surface-header">
        <div>
          <p className="dao-eyebrow">{model.currentWorkspace?.name}</p>
          <h1>Tasks</h1>
          <p>Plan the next useful thing, then return to the work.</p>
        </div>
        <Button className="dao-corner" onClick={() => setDialogOpen(true)}>
          <IconPlus aria-hidden="true" /> New task
        </Button>
      </header>
      <form className="dao-quick-task dao-corner" onSubmit={quickAdd}>
        <IconCircleCheck aria-hidden="true" />
        <Input
          aria-label="Quick task title"
          placeholder="Add a task…"
          value={quickTitle}
          onChange={(event) => setQuickTitle(event.target.value)}
        />
        <Button size="sm" type="submit" variant="ghost">
          Add
        </Button>
      </form>
      <div className="dao-task-list">
        {parents.map((task) => (
          <TaskRow
            key={task.id}
            model={model}
            task={task}
            children={childrenByParent.get(task.id) ?? []}
          />
        ))}
        {parents.length === 0 ? (
          <div className="dao-empty-state">
            <IconCircleCheck aria-hidden="true" />
            <h2>No tasks yet</h2>
            <p>Add the next concrete action for this workspace.</p>
            <Button onClick={() => setDialogOpen(true)}>New task</Button>
          </div>
        ) : null}
      </div>
      {dialogOpen ? (
        <TaskFormDialog model={model} open={dialogOpen} onOpenChange={setDialogOpen} />
      ) : null}
    </section>
  );
}
