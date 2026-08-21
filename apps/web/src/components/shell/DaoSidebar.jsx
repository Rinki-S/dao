import { useMemo, useState } from 'react';
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCircleCheck,
  IconClock,
  IconFile,
  IconFolder,
  IconFolderPlus,
  IconHome,
  IconMessageCircle,
  IconPlus,
  IconSearch,
  IconSettings,
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
import { Collapsible, CollapsiblePanel } from '@/components/ui/collapsible.jsx';
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
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu.jsx';
import { ScrollArea } from '@/components/ui/scroll-area.jsx';
import { Sidebar } from '@/components/ui/sidebar.jsx';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip.jsx';
import { cn } from '@/lib/utils.js';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: IconHome },
  { id: 'tasks', label: 'Tasks', icon: IconCircleCheck },
  { id: 'chats', label: 'Chats', icon: IconMessageCircle, disabled: true },
  { id: 'search', label: 'Search', icon: IconSearch },
  { id: 'activity', label: 'Activity', icon: IconClock },
];

function noteFileName(note) {
  return note.title.toLowerCase().endsWith('.md') ? note.title : `${note.title}.md`;
}

function NameDialog({ open, title, label, initialValue = '', onOpenChange, onSubmit }) {
  const [value, setValue] = useState(initialValue);

  async function submit(event) {
    event.preventDefault();
    const name = value.trim();
    if (!name) return;
    await onSubmit(name);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="dao-corner sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogPanel>
            <Field>
              <FieldLabel>{label}</FieldLabel>
              <Input autoFocus value={value} onChange={(event) => setValue(event.target.value)} />
            </Field>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function HintButton({ label, disabled = false, icon: Icon, active, onClick }) {
  const button = (
    <Button
      aria-label={label}
      className={cn(
        'dao-nav-button dao-corner',
        active && 'dao-nav-button--active',
        active && label === 'Home' && 'dao-nav-button--home',
      )}
      disabled={disabled}
      size="icon"
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
      {active && label === 'Home' ? <span>Home</span> : null}
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup className="dao-corner">
        {disabled ? `${label} · Coming later` : label}
      </TooltipPopup>
    </Tooltip>
  );
}

function NoteRow({ active, note, onOpen, onRename, onDelete }) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger>
          <button
            className={cn('dao-tree-row dao-corner', active && 'dao-tree-row--active')}
            type="button"
            onClick={() => onOpen(note)}
          >
            <IconFile aria-hidden="true" />
            <span>{noteFileName(note)}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuPopup className="dao-corner">
          <ContextMenuItem onClick={() => onOpen(note)}>Open</ContextMenuItem>
          <ContextMenuItem onClick={() => setRenameOpen(true)}>Rename</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <IconTrash aria-hidden="true" />
            Delete
          </ContextMenuItem>
        </ContextMenuPopup>
      </ContextMenu>
      {renameOpen ? (
        <NameDialog
          initialValue={note.title}
          label="Note name"
          open={renameOpen}
          title="Rename note"
          onOpenChange={setRenameOpen}
          onSubmit={(name) => onRename(note, name.replace(/\.md$/i, ''))}
        />
      ) : null}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogPopup className="dao-corner sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{noteFileName(note)}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The note file will be removed from this workspace. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={() => onDelete(note)}
            >
              Delete note
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}

function ProjectFolder({
  activeNoteId,
  defaultOpen,
  project,
  projectNotes,
  revealed,
  onCreateNote,
  onDelete,
  onOpenNote,
  onRename,
  onRenameNote,
  onDeleteNote,
}) {
  const [open, setOpen] = useState(
    defaultOpen || revealed || projectNotes.some((note) => note.id === activeNoteId),
  );
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Collapsible open={open || revealed} onOpenChange={setOpen}>
        <ContextMenu>
          <ContextMenuTrigger>
            <button
              className={cn(
                'dao-tree-row dao-tree-folder dao-corner',
                revealed && 'dao-tree-row--revealed',
              )}
              type="button"
              onClick={() => setOpen((current) => !current)}
            >
              {open || revealed ? (
                <IconChevronDown aria-hidden="true" />
              ) : (
                <IconChevronRight aria-hidden="true" />
              )}
              <IconFolder aria-hidden="true" />
              <span>{project.name}</span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuPopup className="dao-corner">
            <ContextMenuItem onClick={() => onCreateNote(project.id)}>
              <IconPlus aria-hidden="true" />
              New note
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setRenameOpen(true)}>Rename folder</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              <IconTrash aria-hidden="true" />
              Delete folder
            </ContextMenuItem>
          </ContextMenuPopup>
        </ContextMenu>
        <CollapsiblePanel className="dao-tree-children">
          {projectNotes.map((note) => (
            <NoteRow
              key={note.id}
              active={activeNoteId === note.id}
              note={note}
              onDelete={onDeleteNote}
              onOpen={onOpenNote}
              onRename={onRenameNote}
            />
          ))}
          {projectNotes.length === 0 ? (
            <button
              className="dao-tree-empty"
              type="button"
              onClick={() => onCreateNote(project.id)}
            >
              <IconPlus aria-hidden="true" /> New note
            </button>
          ) : null}
        </CollapsiblePanel>
      </Collapsible>
      {renameOpen ? (
        <NameDialog
          initialValue={project.name}
          label="Folder name"
          open={renameOpen}
          title="Rename folder"
          onOpenChange={setRenameOpen}
          onSubmit={(name) => onRename(project, name)}
        />
      ) : null}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogPopup className="dao-corner sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder “{project.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Notes stay in the workspace root, but the folder itself will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={() => onDelete(project)}
            >
              Delete folder
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}

export function DaoSidebar({ model, onOpenSettings, collapsed, onCollapsedChange }) {
  const [recentsOpen, setRecentsOpen] = useState(true);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const notesByProject = useMemo(() => {
    const map = new Map();
    for (const project of model.projects) map.set(project.id, []);
    for (const note of model.notes) {
      if (note.projectId && map.has(note.projectId)) map.get(note.projectId).push(note);
    }
    return map;
  }, [model.notes, model.projects]);
  const rootNotes = model.notes.filter((note) => note.projectId === null);
  const activeNoteId = model.selectedEntity?.type === 'note' ? model.selectedEntity.id : '';

  if (collapsed) {
    return (
      <Sidebar collapsible="none" className="dao-sidebar dao-sidebar--collapsed">
        <Button
          aria-label="Expand sidebar"
          className="dao-corner dao-sidebar-expand"
          size="icon"
          variant="ghost"
          onClick={() => onCollapsedChange(false)}
        >
          <IconChevronRight aria-hidden="true" />
        </Button>
      </Sidebar>
    );
  }

  return (
    <Sidebar collapsible="none" className="dao-sidebar">
      <header className="dao-workspace-header app-drag-region">
        <Menu>
          <MenuTrigger
            className="dao-workspace-trigger app-no-drag dao-corner"
            aria-label="Switch workspace"
          >
            <span className="dao-workspace-mark">{model.currentWorkspace?.name?.[0] ?? 'D'}</span>
            <span>{model.currentWorkspace?.name ?? 'Dao'}</span>
            <IconChevronDown aria-hidden="true" />
          </MenuTrigger>
          <MenuPopup align="start" className="dao-corner">
            {model.workspaces.map((workspace) => (
              <MenuItem key={workspace.id} onClick={() => model.selectWorkspace(workspace.id)}>
                {workspace.name}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem onClick={() => setNewWorkspaceOpen(true)}>
              <IconPlus aria-hidden="true" /> New workspace
            </MenuItem>
          </MenuPopup>
        </Menu>
        <div className="dao-workspace-actions app-no-drag">
          <Button aria-label="Settings" size="icon" variant="ghost" onClick={onOpenSettings}>
            <IconSettings aria-hidden="true" />
          </Button>
          <Button
            aria-label="Collapse sidebar"
            size="icon"
            variant="ghost"
            onClick={() => onCollapsedChange(true)}
          >
            <IconChevronLeft aria-hidden="true" />
          </Button>
        </div>
      </header>

      <nav aria-label="Primary" className="dao-primary-nav">
        {NAV_ITEMS.map((item) => (
          <HintButton
            key={item.id}
            active={model.activeView === item.id}
            disabled={item.disabled}
            icon={item.icon}
            label={item.label}
            onClick={() => {
              if (item.id === 'home') model.openHome();
              else if (!item.disabled) model.setActiveView(item.id);
            }}
          />
        ))}
      </nav>

      <ScrollArea className="dao-sidebar-scroll" fill overscrollContain>
        <div className="dao-sidebar-content">
          <section>
            <button
              className="dao-section-label"
              type="button"
              onClick={() => setRecentsOpen(!recentsOpen)}
            >
              <span>Recents</span>
              {recentsOpen ? (
                <IconChevronDown aria-hidden="true" />
              ) : (
                <IconChevronRight aria-hidden="true" />
              )}
            </button>
            {recentsOpen ? (
              <div className="dao-section-list">
                {model.recents.slice(0, 5).map((recent) => {
                  const entity =
                    recent.entityType === 'note'
                      ? model.notes.find((note) => note.id === recent.entityId)
                      : model.tasks.find((task) => task.id === recent.entityId);
                  if (!entity) return null;
                  return (
                    <button
                      key={`${recent.entityType}:${recent.entityId}`}
                      className={cn(
                        'dao-tree-row dao-corner',
                        model.selectedEntity?.type === recent.entityType &&
                          model.selectedEntity?.id === recent.entityId &&
                          'dao-tree-row--active',
                      )}
                      type="button"
                      onClick={() => model.openEntity(entity)}
                    >
                      {recent.entityType === 'note' ? (
                        <IconFile aria-hidden="true" />
                      ) : (
                        <IconCircleCheck aria-hidden="true" />
                      )}
                      <span>
                        {recent.entityType === 'note' ? noteFileName(entity) : entity.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className="dao-workspace-tree">
            <div className="dao-section-heading">
              <button
                className="dao-section-label"
                type="button"
                onClick={() => setWorkspaceOpen(!workspaceOpen)}
              >
                <span>Workspace</span>
                {workspaceOpen ? (
                  <IconChevronUp aria-hidden="true" />
                ) : (
                  <IconChevronRight aria-hidden="true" />
                )}
              </button>
              <Button
                aria-label="New folder"
                size="icon-xs"
                variant="ghost"
                onClick={() => setNewProjectOpen(true)}
              >
                <IconFolderPlus aria-hidden="true" />
              </Button>
            </div>
            {workspaceOpen ? (
              <div className="dao-section-list">
                {model.projects.map((project, index) => (
                  <ProjectFolder
                    key={project.id}
                    activeNoteId={activeNoteId}
                    defaultOpen={index === 0}
                    project={project}
                    projectNotes={notesByProject.get(project.id) ?? []}
                    revealed={model.revealedProjectId === project.id}
                    onCreateNote={(projectId) => model.addNote({ projectId })}
                    onDelete={model.removeProject}
                    onDeleteNote={model.removeNote}
                    onOpenNote={model.openEntity}
                    onRename={model.renameProject}
                    onRenameNote={model.renameNote}
                  />
                ))}
                {rootNotes.map((note) => (
                  <NoteRow
                    key={note.id}
                    active={activeNoteId === note.id}
                    note={note}
                    onDelete={model.removeNote}
                    onOpen={model.openEntity}
                    onRename={model.renameNote}
                  />
                ))}
                <button
                  className="dao-tree-empty dao-tree-new-root"
                  type="button"
                  onClick={() => model.addNote()}
                >
                  <IconPlus aria-hidden="true" /> New note
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </ScrollArea>

      {newProjectOpen ? (
        <NameDialog
          initialValue=""
          label="Folder name"
          open={newProjectOpen}
          title="New folder"
          onOpenChange={setNewProjectOpen}
          onSubmit={(name) => model.addProject({ name, description: '' })}
        />
      ) : null}
      {newWorkspaceOpen ? (
        <NameDialog
          initialValue=""
          label="Workspace name"
          open={newWorkspaceOpen}
          title="New workspace"
          onOpenChange={setNewWorkspaceOpen}
          onSubmit={(name) => model.addWorkspace({ name, description: '' })}
        />
      ) : null}
    </Sidebar>
  );
}
