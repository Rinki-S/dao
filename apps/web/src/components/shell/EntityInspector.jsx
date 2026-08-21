import {
  IconCalendar,
  IconClock,
  IconFlag,
  IconFolder,
  IconInfoCircle,
  IconRoute,
  IconTrash,
} from '@tabler/icons-react';
import { useId, useState } from 'react';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardHeader, CardPanel, CardTitle } from '@/components/ui/card.jsx';
import { Checkbox } from '@/components/ui/checkbox.jsx';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.jsx';
import { Label } from '@/components/ui/label.jsx';
import { ScrollArea } from '@/components/ui/scroll-area.jsx';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.jsx';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs.jsx';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function relativePath(note, workspace) {
  if (!note?.filePath) return '/';
  if (workspace?.rootPath && note.filePath.startsWith(workspace.rootPath)) {
    return note.filePath.slice(workspace.rootPath.length) || '/';
  }
  const parts = note.filePath.split('/').filter(Boolean);
  return `/${parts.slice(-2).join('/')}`;
}

function MetaRow({ icon: Icon, label, children }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2 text-sm">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <Icon aria-hidden="true" />
        {label}
      </dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

function NoteInfo({ model, note }) {
  const folder = model.projects.find((project) => project.id === note.projectId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {note.title.toLowerCase().endsWith('.md') ? note.title : `${note.title}.md`}
        </CardTitle>
      </CardHeader>
      <CardPanel>
        <dl className="flex flex-col gap-4">
          <MetaRow icon={IconInfoCircle} label="Type">
            Markdown
          </MetaRow>
          <MetaRow icon={IconFolder} label="Folder">
            {folder?.name ?? 'Workspace root'}
          </MetaRow>
          <MetaRow icon={IconRoute} label="Path">
            {relativePath(note, model.currentWorkspace)}
          </MetaRow>
          <MetaRow icon={IconCalendar} label="Created">
            {formatDate(note.createdAt)}
          </MetaRow>
          <MetaRow icon={IconClock} label="Updated">
            {formatDate(note.updatedAt)}
          </MetaRow>
        </dl>
      </CardPanel>
    </Card>
  );
}

function TaskInfo({ model, task }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const projectOptions = [
    { label: 'Workspace root', value: 'none' },
    ...model.projects.map((project) => ({ label: project.name, value: project.id })),
  ];
  const priorityOptions = [
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: 'Low', value: 'low' },
  ];
  const subtasks = model.tasks.filter((candidate) => candidate.parentId === task.id);
  const completedSubtasks = subtasks.filter((item) => item.status === 'done').length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{task.title}</CardTitle>
          <Badge variant="secondary">
            {task.status === 'done' ? 'Done' : task.status === 'doing' ? 'In progress' : 'To do'}
          </Badge>
        </CardHeader>
        <CardPanel>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <IconFlag aria-hidden="true" />
                Priority
              </span>
              <Select
                items={priorityOptions}
                value={task.priority}
                onValueChange={(priority) => model.patchTask(task.id, { priority })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup alignItemWithTrigger={false}>
                  {priorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <IconFolder aria-hidden="true" />
                Folder
              </span>
              <Select
                items={projectOptions}
                value={task.projectId ?? 'none'}
                onValueChange={(value) =>
                  model.patchTask(task.id, { projectId: value === 'none' ? null : value })
                }
              >
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
            </div>
            <dl className="flex flex-col gap-4">
              <MetaRow icon={IconCalendar} label="Created">
                {formatDate(task.createdAt)}
              </MetaRow>
              <MetaRow icon={IconCalendar} label="Due date">
                {formatDate(task.dueDate)}
              </MetaRow>
              <MetaRow icon={IconClock} label="Updated">
                {formatDate(task.updatedAt)}
              </MetaRow>
            </dl>
          </div>
        </CardPanel>
      </Card>

      {task.description ? (
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardPanel>{task.description}</CardPanel>
        </Card>
      ) : null}

      {subtasks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Subtasks {completedSubtasks}/{subtasks.length}
            </CardTitle>
          </CardHeader>
          <CardPanel>
            <div className="flex flex-col gap-3">
              {subtasks.map((subtask) => (
                <SubtaskCheckbox key={subtask.id} model={model} subtask={subtask} />
              ))}
            </div>
          </CardPanel>
        </Card>
      ) : null}

      <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
        <IconTrash aria-hidden="true" />
        Delete task
      </Button>
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
    </div>
  );
}

function SubtaskCheckbox({ model, subtask }) {
  const id = useId();
  return (
    <Label htmlFor={id}>
      <Checkbox
        id={id}
        checked={subtask.status === 'done'}
        onCheckedChange={() => model.toggleTask(subtask)}
      />
      {subtask.title}
    </Label>
  );
}

function EntityActivity({ model }) {
  const selectedId = model.selectedEntity?.id;
  const activities = selectedId
    ? model.activities.filter((activity) => activity.entityId === selectedId)
    : model.activities.slice(0, 8);

  if (activities.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No activity</EmptyTitle>
          <EmptyDescription>No activity has been recorded for this item.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Card>
      <CardPanel>
        <ul className="flex flex-col gap-3 text-sm">
          {activities.map((activity) => (
            <li key={activity.id} className="flex items-center justify-between gap-3">
              <span>
                <strong>{activity.action}</strong> {activity.entityType}
              </span>
              <time className="text-muted-foreground">{formatDate(activity.createdAt)}</time>
            </li>
          ))}
        </ul>
      </CardPanel>
    </Card>
  );
}

export function EntityInspector({ model }) {
  return (
    <aside className="flex h-svh w-80 shrink-0 flex-col border-l bg-background p-2">
      <Tabs className="min-h-0 flex-1" defaultValue="info">
        <TabsList variant="underline">
          <TabsTab value="info">Info</TabsTab>
          <TabsTab value="activity">Activity</TabsTab>
        </TabsList>
        <TabsPanel value="info">
          <ScrollArea className="h-full" overscrollContain>
            {model.selectedNote ? (
              <NoteInfo model={model} note={model.selectedNote} />
            ) : model.selectedTask ? (
              <TaskInfo model={model} task={model.selectedTask} />
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconInfoCircle aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Nothing selected</EmptyTitle>
                  <EmptyDescription>Select a note or task to inspect it.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </ScrollArea>
        </TabsPanel>
        <TabsPanel value="activity">
          <ScrollArea className="h-full" overscrollContain>
            <EntityActivity model={model} />
          </ScrollArea>
        </TabsPanel>
      </Tabs>
    </aside>
  );
}
