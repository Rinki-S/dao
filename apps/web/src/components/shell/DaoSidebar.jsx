import { useMemo, useState } from 'react';
import {
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconFile,
  IconFolder,
  IconFolderPlus,
  IconHome,
  IconLeaf,
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
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@/components/ui/collapsible.jsx';
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '@/components/ui/sidebar.jsx';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: IconHome },
  { id: 'tasks', label: 'Tasks', icon: IconCircleCheck },
  { id: 'chats', label: 'Chats', icon: IconMessageCircle, disabled: true },
  { id: 'search', label: 'Search', icon: IconSearch },
];

function noteFileName(note) {
  return note.title.toLowerCase().endsWith('.md') ? note.title : `${note.title}.md`;
}

function NameDialog({ open, title, label, initialValue = '', onOpenChange, onSubmit }) {
  const [value, setValue] = useState(initialValue);
  // The dialog stays mounted so it can animate in and out, so the field is
  // seeded on each open instead of by a fresh mount.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(initialValue);
  }

  async function submit(event) {
    event.preventDefault();
    const name = value.trim();
    if (!name) return;
    await onSubmit(name);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form className="contents" onSubmit={submit}>
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

function NoteRow({ active, nested = false, note, onOpen, onRename, onDelete }) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const RowItem = nested ? SidebarMenuSubItem : SidebarMenuItem;
  const row = nested ? (
    <SidebarMenuSubButton
      isActive={active}
      render={<button type="button" />}
      onClick={() => onOpen(note)}
    >
      <IconFile aria-hidden="true" />
      <span>{noteFileName(note)}</span>
    </SidebarMenuSubButton>
  ) : (
    <SidebarMenuButton isActive={active} tooltip={noteFileName(note)} onClick={() => onOpen(note)}>
      <IconFile aria-hidden="true" />
      <span>{noteFileName(note)}</span>
    </SidebarMenuButton>
  );

  return (
    <>
      <RowItem>
        <ContextMenu>
          <ContextMenuTrigger>{row}</ContextMenuTrigger>
          <ContextMenuPopup>
            <ContextMenuItem onClick={() => onOpen(note)}>Open</ContextMenuItem>
            <ContextMenuItem onClick={() => setRenameOpen(true)}>Rename</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              <IconTrash aria-hidden="true" />
              Delete
            </ContextMenuItem>
          </ContextMenuPopup>
        </ContextMenu>
      </RowItem>
      <NameDialog
        initialValue={note.title}
        label="Note name"
        open={renameOpen}
        title="Rename note"
        onOpenChange={setRenameOpen}
        onSubmit={(name) => onRename(note, name.replace(/\.md$/i, ''))}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogPopup>
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
        <SidebarMenuItem>
          <ContextMenu>
            <ContextMenuTrigger>
              <CollapsibleTrigger render={<SidebarMenuButton isActive={revealed} />}>
                {open || revealed ? (
                  <IconChevronDown aria-hidden="true" />
                ) : (
                  <IconChevronRight aria-hidden="true" />
                )}
                <IconFolder aria-hidden="true" />
                <span>{project.name}</span>
              </CollapsibleTrigger>
            </ContextMenuTrigger>
            <ContextMenuPopup>
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
          <CollapsiblePanel>
            <SidebarMenuSub>
              {projectNotes.map((note) => (
                <NoteRow
                  key={note.id}
                  active={activeNoteId === note.id}
                  nested
                  note={note}
                  onDelete={onDeleteNote}
                  onOpen={onOpenNote}
                  onRename={onRenameNote}
                />
              ))}
              {projectNotes.length === 0 ? (
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    render={<button type="button" />}
                    onClick={() => onCreateNote(project.id)}
                  >
                    <IconPlus aria-hidden="true" />
                    <span>New note</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ) : null}
            </SidebarMenuSub>
          </CollapsiblePanel>
        </SidebarMenuItem>
      </Collapsible>
      <NameDialog
        initialValue={project.name}
        label="Folder name"
        open={renameOpen}
        title="Rename folder"
        onOpenChange={setRenameOpen}
        onSubmit={(name) => onRename(project, name)}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogPopup>
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

export function DaoSidebar({ model, onOpenSettings }) {
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

  return (
    <Sidebar>
      {/* Titlebar band. Same height as a workspace top bar so the macOS traffic
          lights stay optically centred in either sidebar state, and the trigger
          keeps the same x as the one in SidebarRevealSlot. */}
      <SidebarHeader className="gap-0 p-0">
        <div aria-hidden="true" className="app-drag-region me-12 h-12 shrink-0" />
        <div className="px-2 pb-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <Menu>
                <MenuTrigger render={<SidebarMenuButton />}>
                  <IconLeaf aria-hidden="true" />
                  <span>{model.currentWorkspace?.name ?? 'Dao'}</span>
                  <IconChevronDown aria-hidden="true" />
                </MenuTrigger>
                <MenuPopup align="start">
                  {model.workspaces.map((workspace) => (
                    <MenuItem
                      key={workspace.id}
                      onClick={() => model.selectWorkspace(workspace.id)}
                    >
                      {workspace.name}
                    </MenuItem>
                  ))}
                  <MenuSeparator />
                  <MenuItem onClick={() => setNewWorkspaceOpen(true)}>
                    <IconPlus aria-hidden="true" />
                    New workspace
                  </MenuItem>
                </MenuPopup>
              </Menu>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    disabled={item.disabled}
                    isActive={model.activeView === item.id}
                    tooltip={item.disabled ? `${item.label} · Coming later` : item.label}
                    onClick={() => {
                      if (item.id === 'home') model.openHome();
                      else if (!item.disabled) model.setActiveView(item.id);
                    }}
                  >
                    <item.icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Recents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {model.recents.slice(0, 5).map((recent) => {
                const entity =
                  recent.entityType === 'note'
                    ? model.notes.find((note) => note.id === recent.entityId)
                    : model.tasks.find((task) => task.id === recent.entityId);
                if (!entity) return null;
                const label = recent.entityType === 'note' ? noteFileName(entity) : entity.title;
                return (
                  <SidebarMenuItem key={`${recent.entityType}:${recent.entityId}`}>
                    <SidebarMenuButton
                      isActive={
                        model.selectedEntity?.type === recent.entityType &&
                        model.selectedEntity?.id === recent.entityId
                      }
                      tooltip={label}
                      onClick={() => model.openEntity(entity)}
                    >
                      {recent.entityType === 'note' ? (
                        <IconFile aria-hidden="true" />
                      ) : (
                        <IconCircleCheck aria-hidden="true" />
                      )}
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupAction aria-label="New folder" onClick={() => setNewProjectOpen(true)}>
            <IconFolderPlus aria-hidden="true" />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
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
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => model.addNote()}>
                  <IconPlus aria-hidden="true" />
                  <span>New note</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings" onClick={onOpenSettings}>
              <IconSettings aria-hidden="true" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />

      <NameDialog
        label="Folder name"
        open={newProjectOpen}
        title="New folder"
        onOpenChange={setNewProjectOpen}
        onSubmit={(name) => model.addProject({ name, description: '' })}
      />
      <NameDialog
        label="Workspace name"
        open={newWorkspaceOpen}
        title="New workspace"
        onOpenChange={setNewWorkspaceOpen}
        onSubmit={(name) => model.addWorkspace({ name, description: '' })}
      />
    </Sidebar>
  );
}
