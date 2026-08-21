import { useId, useMemo, useState } from 'react';
import { IconCircleCheck, IconEdit, IconFlag, IconPlus, IconTrash } from '@tabler/icons-react';
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
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from '@/components/ui/card.jsx';
import { Checkbox } from '@/components/ui/checkbox.jsx';
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog.jsx';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.jsx';
import { Field, FieldLabel } from '@/components/ui/field.jsx';
import { Group, GroupSeparator } from '@/components/ui/group.jsx';
import { Input } from '@/components/ui/input.jsx';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group.jsx';
import { Label } from '@/components/ui/label.jsx';
import { ScrollArea } from '@/components/ui/scroll-area.jsx';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';

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
    if (task) await model.patchTask(task.id, input);
    else await model.addTask({ ...input, parentId });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{task ? 'Edit task' : parentId ? 'New subtask' : 'New task'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogPanel>
            <div className="flex flex-col gap-4">
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
              <Field>
                <FieldLabel>Folder</FieldLabel>
                <Select items={projectOptions} value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup alignItemWithTrigger={false}>
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
                  <SelectPopup alignItemWithTrigger={false}>
                    {PRIORITIES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Due date</FieldLabel>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>
            </div>
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

function TaskCheckbox({ model, task }) {
  const id = useId();
  return (
    <Label htmlFor={id}>
      <Checkbox
        id={id}
        aria-label={`Mark ${task.title} ${task.status === 'done' ? 'incomplete' : 'complete'}`}
        checked={task.status === 'done'}
        onCheckedChange={() => model.toggleTask(task)}
      />
      {task.title}
    </Label>
  );
}

function TaskCard({ model, task, children }) {
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const folder = model.projects.find((project) => project.id === task.projectId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <TaskCheckbox model={model} task={task} />
        </CardTitle>
        <CardDescription>
          {folder?.name ?? 'Workspace root'} · {task.priority} priority
        </CardDescription>
        <CardAction>
          <Group>
            <Button
              aria-label={`Open ${task.title}`}
              size="icon-sm"
              variant="outline"
              onClick={() => model.openEntity(task)}
            >
              <IconCircleCheck aria-hidden="true" />
            </Button>
            <GroupSeparator />
            <Button
              aria-label={`Add subtask to ${task.title}`}
              size="icon-sm"
              variant="outline"
              onClick={() => setSubtaskOpen(true)}
            >
              <IconPlus aria-hidden="true" />
            </Button>
            <GroupSeparator />
            <Button
              aria-label={`Edit ${task.title}`}
              size="icon-sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
            >
              <IconEdit aria-hidden="true" />
            </Button>
            <GroupSeparator />
            <Button
              aria-label={`Delete ${task.title}`}
              size="icon-sm"
              variant="outline"
              onClick={() => setDeleteOpen(true)}
            >
              <IconTrash aria-hidden="true" />
            </Button>
          </Group>
        </CardAction>
      </CardHeader>
      {children.length > 0 ? (
        <CardPanel>
          <div className="flex flex-col gap-3">
            {children.map((child) => (
              <TaskCheckbox key={child.id} model={model} task={child} />
            ))}
          </div>
        </CardPanel>
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
        <AlertDialogPopup>
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
    </Card>
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
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-4 border-b p-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">Tasks</h1>
          <p className="text-muted-foreground text-sm">{model.currentWorkspace?.name}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <IconPlus aria-hidden="true" />
          New task
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1" overscrollContain>
        <div className="flex flex-col gap-4 p-4">
          <form onSubmit={quickAdd}>
            <InputGroup>
              <InputGroupInput
                aria-label="Quick task title"
                placeholder="Add a task…"
                value={quickTitle}
                onChange={(event) => setQuickTitle(event.target.value)}
              />
              <InputGroupAddon>
                <IconCircleCheck aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupAddon align="inline-end">
                <Button size="sm" type="submit" variant="ghost">
                  Add
                </Button>
              </InputGroupAddon>
            </InputGroup>
          </form>
          {parents.map((task) => (
            <TaskCard
              key={task.id}
              model={model}
              task={task}
              children={childrenByParent.get(task.id) ?? []}
            />
          ))}
          {parents.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconFlag aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No tasks yet</EmptyTitle>
                <EmptyDescription>
                  Add the next concrete action for this workspace.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setDialogOpen(true)}>New task</Button>
              </EmptyContent>
            </Empty>
          ) : null}
        </div>
      </ScrollArea>
      {dialogOpen ? (
        <TaskFormDialog model={model} open={dialogOpen} onOpenChange={setDialogOpen} />
      ) : null}
    </section>
  );
}
