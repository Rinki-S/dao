import {
  IconCalendar,
  IconCircleCheck,
  IconClock,
  IconFile,
  IconFlag,
  IconFolder,
  IconInfoCircle,
  IconRoute,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
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
    <div className="dao-inspector-row">
      <span>
        <Icon aria-hidden="true" />
        {label}
      </span>
      <strong>{children}</strong>
    </div>
  );
}

function NoteInfo({ model, note }) {
  const folder = model.projects.find((project) => project.id === note.projectId);
  return (
    <div className="dao-inspector-content">
      <div className="dao-inspector-title">
        <IconFile aria-hidden="true" />
        <h2>{note.title.toLowerCase().endsWith('.md') ? note.title : `${note.title}.md`}</h2>
      </div>
      <div className="dao-inspector-meta">
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
      </div>
    </div>
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
  return (
    <div className="dao-inspector-content">
      <div className="dao-inspector-title dao-inspector-task-title">
        <IconCircleCheck aria-hidden="true" />
        <h2>{task.title}</h2>
      </div>
      <div className="dao-inspector-status">
        <span className={`dao-status-dot dao-status-dot--${task.status}`} />
        {task.status === 'done' ? 'Done' : task.status === 'doing' ? 'In progress' : 'To do'}
      </div>
      <div className="dao-inspector-meta">
        <div className="dao-inspector-control">
          <span>
            <IconFlag aria-hidden="true" />
            Priority
          </span>
          <Select
            items={priorityOptions}
            value={task.priority}
            onValueChange={(priority) => model.patchTask(task.id, { priority })}
          >
            <SelectTrigger className="dao-inspector-select">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false} className="dao-corner">
              {priorityOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
        <div className="dao-inspector-control">
          <span>
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
            <SelectTrigger className="dao-inspector-select">
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
        </div>
        <MetaRow icon={IconCalendar} label="Created">
          {formatDate(task.createdAt)}
        </MetaRow>
        <MetaRow icon={IconCalendar} label="Due date">
          {formatDate(task.dueDate)}
        </MetaRow>
        <MetaRow icon={IconClock} label="Updated">
          {formatDate(task.updatedAt)}
        </MetaRow>
      </div>
      {task.description ? (
        <section className="dao-inspector-section">
          <h3>Description</h3>
          <p>{task.description}</p>
        </section>
      ) : null}
      {subtasks.length > 0 ? (
        <section className="dao-inspector-section">
          <h3>
            Subtasks{' '}
            <span>
              {subtasks.filter((item) => item.status === 'done').length}/{subtasks.length}
            </span>
          </h3>
          {subtasks.map((subtask) => (
            <label key={subtask.id} className="dao-inspector-subtask">
              <Checkbox
                checked={subtask.status === 'done'}
                onCheckedChange={() => model.toggleTask(subtask)}
              />
              {subtask.title}
            </label>
          ))}
        </section>
      ) : null}
      <Button className="dao-inspector-delete" variant="ghost" onClick={() => setDeleteOpen(true)}>
        <IconTrash aria-hidden="true" />
        Delete task
      </Button>
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

function EntityActivity({ model }) {
  const selectedId = model.selectedEntity?.id;
  const activities = selectedId
    ? model.activities.filter((activity) => activity.entityId === selectedId)
    : model.activities.slice(0, 8);
  return (
    <div className="dao-inspector-activity">
      {activities.map((activity) => (
        <div key={activity.id}>
          <span className="dao-activity-dot" />
          <p>
            <strong>{activity.action}</strong> {activity.entityType}
          </p>
          <time>{formatDate(activity.createdAt)}</time>
        </div>
      ))}
      {activities.length === 0 ? (
        <p className="dao-inspector-empty">No activity for this item.</p>
      ) : null}
    </div>
  );
}

export function EntityInspector({ model }) {
  return (
    <aside className="dao-inspector">
      <Tabs defaultValue="info" className="h-full gap-0">
        <TabsList className="dao-inspector-tabs" variant="underline">
          <TabsTab value="info">Info</TabsTab>
          <TabsTab value="activity">Activity</TabsTab>
        </TabsList>
        <TabsPanel value="info" className="min-h-0">
          <ScrollArea className="h-full" overscrollContain>
            {model.selectedNote ? (
              <NoteInfo model={model} note={model.selectedNote} />
            ) : model.selectedTask ? (
              <TaskInfo model={model} task={model.selectedTask} />
            ) : (
              <div className="dao-inspector-empty-state">
                <IconInfoCircle aria-hidden="true" />
                <p>Select a note or task to inspect it.</p>
              </div>
            )}
          </ScrollArea>
        </TabsPanel>
        <TabsPanel value="activity" className="min-h-0">
          <ScrollArea className="h-full" overscrollContain>
            <EntityActivity model={model} />
          </ScrollArea>
        </TabsPanel>
      </Tabs>
    </aside>
  );
}
