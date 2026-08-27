import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  IconSparkles,
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
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip.jsx';
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
  useSidebar,
} from '@/components/ui/sidebar.jsx';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: IconHome },
  { id: 'today', label: 'Today', icon: IconSparkles },
  { id: 'tasks', label: 'Tasks', icon: IconCircleCheck },
  { id: 'chats', label: 'Chats', icon: IconMessageCircle },
  { id: 'search', label: 'Search', icon: IconSearch },
];

// A private MIME type keeps the sidebar from accepting text dragged in from
// anywhere else, and lets a drop target check the payload during dragover —
// where getData() is deliberately blank.
const NOTE_DRAG_TYPE = 'application/x-dao-note-id';
const FOLDER_DRAG_TYPE = 'application/x-dao-folder-id';

/**
 * The one row currently under the pointer during a drag. Shared rather than
 * per-row because a row cannot tell that a descendant has taken over: entering
 * a child fires no leave on the parent, so both would stay lit.
 *
 * `undefined` means no target, `null` means the workspace root.
 */
const TreeDropContext = createContext({ target: undefined, setTarget: () => {} });

/**
 * Wiring for a region that accepts a dropped note or folder. The callbacks
 * receive the dragged id; the caller decides which destination that means.
 *
 * `id` identifies the region so it can highlight only while it is the target,
 * and so a folder can refuse itself — the service rejects a folder moved inside
 * itself, but the row should not invite the gesture in the first place.
 */
function useTreeDropTarget({ id, onDropNote, onDropFolder }) {
  const { target, setTarget } = useContext(TreeDropContext);

  const accepts = (event) => {
    const { types } = event.dataTransfer;
    if (types.includes(NOTE_DRAG_TYPE)) return true;
    // getData is blank during dragover, so a folder cannot be identified yet —
    // only whether one is being dragged at all.
    return Boolean(onDropFolder) && types.includes(FOLDER_DRAG_TYPE);
  };

  // Regions nest, so dragging over a child bubbles through its ancestors.
  // Stopping here leaves the innermost region as the only claimant, and
  // dragover repeating means the claim re-asserts itself every frame.
  const claim = (event) => {
    if (!accepts(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setTarget(id);
  };

  return {
    over: target === id,
    props: {
      onDragEnter: claim,
      onDragOver: claim,
      onDragLeave: (event) => {
        // Moving onto a child fires leave on the parent, so ignore anything
        // still inside this region.
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setTarget((current) => (current === id ? undefined : current));
      },
      onDrop: (event) => {
        setTarget(undefined);

        const noteId = event.dataTransfer.getData(NOTE_DRAG_TYPE);
        if (noteId) {
          event.preventDefault();
          event.stopPropagation();
          onDropNote(noteId);
          return;
        }

        const folderId = event.dataTransfer.getData(FOLDER_DRAG_TYPE);
        if (!folderId || !onDropFolder) return;
        event.preventDefault();
        event.stopPropagation();
        // Dropping a folder on itself is a no-op, not a move to its parent.
        if (folderId === id) return;
        onDropFolder(folderId);
      },
    },
  };
}

/**
 * The workspace root as a drop region: dropping here is what takes a note or
 * folder back out of whatever folder it was in.
 *
 * It is a component rather than a hook call in DaoSidebar because DaoSidebar
 * is what provides TreeDropContext, and a component cannot read a context it
 * provides itself — it would see the default value.
 */
function WorkspaceDropRegion({ children, onDropFolder, onDropNote }) {
  const drop = useTreeDropTarget({ id: null, onDropFolder, onDropNote });

  return (
    <SidebarGroupContent
      className={cn('rounded-lg', drop.over && 'bg-sidebar-accent/40')}
      {...drop.props}
    >
      {children}
    </SidebarGroupContent>
  );
}

/**
 * One entry in the primary navigation. The current view is a pill carrying its
 * label; the others are bare icons, so the row shows where you are without
 * repeating four names.
 *
 * An icon on its own is not a name, so every item keeps `aria-label`, and the
 * ones without a visible label get a tooltip too — except when disabled, which
 * takes the button out of the hover and focus path entirely.
 */
function PrimaryNavItem({ active, item, onSelect }) {
  const button = (
    <Button
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
      className={cn(
        // rounded-full has to reach the inset ring as well, or the pill keeps a
        // rectangular highlight inside a round border.
        'rounded-full before:rounded-full',
        // The gap is what spaces the label, and it animates to zero with it.
        // Padding on the label instead would not collapse: a grid item in a 0fr
        // track still occupies its own padding, which left the button 6px wider
        // than tall — an oval hover, an off-centre icon, and a strip of
        // clickable nothing beside it.
        'transition-[padding,gap,background-color,color] duration-200 ease-shell',
        // Never narrower than it is tall, which is what makes the collapsed
        // state a circle. Padding alone cannot: the button's own
        // `[&_svg]:-mx-0.5` pulls 4px back out of the icon, so the natural
        // width came to 24px against a 28px height — a vertical pill.
        'min-w-8 sm:min-w-7',
        // The sidebar colours its own selection and hover, and this row sits in
        // it: --secondary belongs to the workspace surface and reads as a
        // different material here.
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        active
          ? 'gap-1.5 bg-sidebar-accent px-[calc(--spacing(2.5)-1px)] font-medium text-sidebar-accent-foreground'
          : 'gap-0 px-[calc(--spacing(1.5)-1px)]',
      )}
      disabled={item.disabled}
      size="sm"
      variant="ghost"
      onClick={onSelect}
    >
      <item.icon aria-hidden="true" />
      {/* 0fr to 1fr animates to the label's own width, which a max-width
          cannot: any fixed ceiling finishes the visible growth early. */}
      <span
        className={cn(
          'grid transition-[grid-template-columns,opacity] duration-200 ease-shell',
          active ? 'grid-cols-[1fr] opacity-100' : 'grid-cols-[0fr] opacity-0',
        )}
      >
        {/* Clipped to nothing is not something anyone can perceive, so it
            leaves the accessibility tree too — aria-label carries the name. */}
        <span
          aria-hidden={active ? undefined : 'true'}
          className="overflow-hidden whitespace-nowrap"
        >
          {item.label}
        </span>
      </span>
    </Button>
  );

  // The wrapper is unconditional: returning a bare Button for the current view
  // and a Tooltip for the others changes the element type at this position, so
  // React would tear the button down and build a new one on every switch. A
  // fresh node starts at its final style, which is why nothing could animate.
  return (
    <Tooltip>
      <TooltipTrigger delay={300} render={button} />
      {/* Only the popup is conditional. The current view already shows its
          label, and a disabled item never gets the hover that opens this. */}
      {!active && !item.disabled ? <TooltipPopup>{item.label}</TooltipPopup> : null}
    </Tooltip>
  );
}

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
  // The note id travels in the drag payload; drop targets read it back to know
  // what to move. text/plain carries the file name so a drag that lands outside
  // the app still says something useful.
  const dragProps = {
    draggable: true,
    onDragStart: (event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(NOTE_DRAG_TYPE, note.id);
      event.dataTransfer.setData('text/plain', noteFileName(note));
    },
  };
  const row = nested ? (
    <SidebarMenuSubButton
      isActive={active}
      render={<button type="button" {...dragProps} />}
      onClick={() => onOpen(note)}
    >
      <IconFile aria-hidden="true" />
      <span>{noteFileName(note)}</span>
    </SidebarMenuSubButton>
  ) : (
    <SidebarMenuButton
      isActive={active}
      render={<button type="button" {...dragProps} />}
      tooltip={noteFileName(note)}
      onClick={() => onOpen(note)}
    >
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
  childFolders,
  defaultOpen,
  notesByProject,
  project,
  projectNotes,
  revealedProjectId,
  onCreateFolder,
  onCreateNote,
  onDelete,
  onOpenNote,
  onRename,
  onRenameNote,
  onDeleteNote,
  onDropFolder,
  onDropNote,
}) {
  const revealed = revealedProjectId === project.id;
  const [open, setOpen] = useState(
    defaultOpen || revealed || projectNotes.some((note) => note.id === activeNoteId),
  );
  const [renameOpen, setRenameOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const drop = useTreeDropTarget({
    id: project.id,
    onDropNote: (noteId) => onDropNote(noteId, project.id),
    onDropFolder: (folderId) => onDropFolder(folderId, project.id),
  });
  const dragProps = {
    draggable: true,
    onDragStart: (event) => {
      // A folder drag must not also read as a drag of the rows inside it.
      event.stopPropagation();
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(FOLDER_DRAG_TYPE, project.id);
      event.dataTransfer.setData('text/plain', project.name);
    },
  };
  const isEmpty = projectNotes.length === 0 && childFolders.length === 0;

  return (
    <>
      <Collapsible open={open || revealed} onOpenChange={setOpen}>
        {/* The drop region is the folder row plus whatever it contains, so an
            open folder highlights over its whole subtree and a note dropped
            anywhere inside it lands in this folder. */}
        <SidebarMenuItem
          className={cn('rounded-lg', drop.over && 'bg-sidebar-accent/60')}
          {...drop.props}
        >
          <ContextMenu>
            <ContextMenuTrigger>
              <CollapsibleTrigger
                render={
                  <SidebarMenuButton
                    isActive={revealed}
                    render={<button type="button" {...dragProps} />}
                  />
                }
              >
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
              <ContextMenuItem onClick={() => setNewFolderOpen(true)}>
                <IconFolderPlus aria-hidden="true" />
                New folder
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
              {/* Folders before notes, and folders render themselves, so depth
                  is whatever the data says rather than a fixed two levels. */}
              {childFolders.map((child) => (
                <ProjectFolder
                  key={child.id}
                  activeNoteId={activeNoteId}
                  childFolders={child.children}
                  defaultOpen={false}
                  notesByProject={notesByProject}
                  project={child}
                  projectNotes={notesByProject.get(child.id) ?? []}
                  revealedProjectId={revealedProjectId}
                  onCreateFolder={onCreateFolder}
                  onCreateNote={onCreateNote}
                  onDelete={onDelete}
                  onDeleteNote={onDeleteNote}
                  onDropFolder={onDropFolder}
                  onDropNote={onDropNote}
                  onOpenNote={onOpenNote}
                  onRename={onRename}
                  onRenameNote={onRenameNote}
                />
              ))}
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
              {isEmpty ? (
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
        label="Folder name"
        open={newFolderOpen}
        title={`New folder in ${project.name}`}
        onOpenChange={setNewFolderOpen}
        onSubmit={(name) => onCreateFolder(name, project.id)}
      />
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

export function DaoSidebar({ model, peeking = false, onOpenSettings, onPeekChange }) {
  const { state } = useSidebar();
  const peeked = state === 'collapsed' && peeking;
  const peekRef = useRef(null);

  // The window trigger is fixed and the macOS traffic lights are native views,
  // so both sit above the peeked sidebar without being inside it: a pointer
  // moving onto either one fires leave on the sidebar while still visually
  // over it. Geometry is what actually decides, and a pointer that stops
  // reporting (because it is over native chrome) holds the peek open.
  useEffect(() => {
    if (!peeked) return undefined;

    function handleMove(event) {
      const edge = peekRef.current?.getBoundingClientRect().right ?? 0;
      if (event.clientX > edge) onPeekChange?.(false);
    }

    window.addEventListener('pointermove', handleMove);
    return () => window.removeEventListener('pointermove', handleMove);
  }, [onPeekChange, peeked]);
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
  // Folders arrive flat with a parentId; the tree is assembled once here so
  // every level renders from the same shape.
  const folderTree = useMemo(() => {
    const children = new Map();
    for (const project of model.projects) children.set(project.id, []);

    const roots = [];
    for (const project of model.projects) {
      const siblings = children.get(project.parentId);
      // A folder whose parent is missing would otherwise vanish from the tree,
      // so it falls back to the root rather than being dropped.
      if (project.parentId && siblings) siblings.push(project);
      else roots.push(project);
    }

    const attach = (project) => ({
      ...project,
      children: (children.get(project.id) ?? []).map(attach),
    });

    return roots.map(attach);
  }, [model.projects]);
  // Resolved up front: an entry whose entity is gone must not count towards the
  // five shown, and must not leave the group rendering an empty list. What is
  // open is dropped too — it is already on screen and marked in the tree, so
  // listing it here only competes for the same selected state.
  const recentEntries = useMemo(
    () =>
      model.recents
        .filter(
          (recent) =>
            !(
              model.selectedEntity?.type === recent.entityType &&
              model.selectedEntity?.id === recent.entityId
            ),
        )
        .map((recent) => {
          const entity = model.notes.find((note) => note.id === recent.entityId);
          return entity ? { entity, recent } : null;
        })
        .filter(Boolean)
        .slice(0, 5),
    [model.notes, model.recents, model.selectedEntity],
  );
  const workspaceIsEmpty = model.projects.length === 0 && rootNotes.length === 0;
  // Drop targets carry a note id, not the note, so the row that started the
  // drag does not have to stay mounted for the drop to resolve.
  const moveNoteById = (noteId, projectId) => {
    const note = model.notes.find((item) => item.id === noteId);
    if (note) model.moveNote(note, projectId);
  };
  const [dropTarget, setDropTarget] = useState(undefined);
  const dropContext = useMemo(
    () => ({ setTarget: setDropTarget, target: dropTarget }),
    [dropTarget],
  );
  const moveFolderById = (folderId, parentId) => {
    const folder = model.projects.find((item) => item.id === folderId);
    if (folder) model.moveProject(folder, parentId);
  };
  const activeNoteId = model.selectedEntity?.type === 'note' ? model.selectedEntity.id : '';

  // A drag can end without a drop — Escape, or released outside the window —
  // and no row would hear about it, leaving the last target highlighted.
  useEffect(() => {
    const clear = () => setDropTarget(undefined);
    window.addEventListener('dragend', clear);
    return () => window.removeEventListener('dragend', clear);
  }, []);

  return (
    <TreeDropContext.Provider value={dropContext}>
      {/* Hover target for peeking the hidden sidebar back in. It starts below
          the titlebar so the window's top-left drag corner stays reachable, and
          only mouse pointers arm it — a touch would open it on any left swipe. */}
      {state === 'collapsed' && !peeking && (
        <div
          aria-hidden="true"
          className="fixed top-12 bottom-0 left-0 z-20 w-2"
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') onPeekChange?.(true);
          }}
        />
      )}
      <Sidebar
        ref={peekRef}
        className={cn(
          // Backing layer behind the translucent surface. Fading its opacity
          // keeps the colour itself switching with the theme like every other
          // token, and opacity composites instead of repainting.
          'before:pointer-events-none before:absolute before:-z-1 before:inset-0 before:bg-(--sidebar-solid) before:opacity-0 before:transition-opacity before:delay-[160ms] before:duration-[140ms] before:ease-shell',
          // Arriving, it fades in over half the slide: quick enough that the
          // panel is opaque well before much of it has crossed the workspace,
          // slow enough to read as the material arriving rather than a swap.
          // Leaving, it waits for the workspace to finish sliding back
          // underneath before it clears.
          peeked &&
            'left-0! shadow-xl/10 before:opacity-100 before:delay-0 before:duration-[100ms]',
        )}
      >
        {/* Titlebar band. Same height as a workspace top bar so the macOS traffic
          lights stay optically centred in either sidebar state, and the trigger
          keeps the same x as the one in SidebarRevealSlot. */}
        <SidebarHeader className="gap-0 p-0">
          <div aria-hidden="true" className="app-drag-region me-12 h-12 shrink-0" />
          {/* The workspace and the view it is showing belong together and stay
              put: SidebarContent scrolls, SidebarHeader does not, so living
              here is what pins them rather than a sticky offset. gap-1 is the
              sidebar's own rhythm between rows. */}
          <div className="flex flex-col gap-1 px-2 pb-2">
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
            {/* Only the current view spells itself out; the rest stay icons.
                The row reads as one control that way, and the label is the
                thing that says where you are. */}
            {/* The cursor belongs to the row, not to each button. Four round
                buttons with gaps between them put a dozen pointer/default
                boundaries across 120px, and sweeping past turned the cursor
                into a strobe. The row is one control; treat it as one. */}
            <nav aria-label="Primary" className="flex cursor-pointer items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <PrimaryNavItem
                  key={item.id}
                  active={model.activeView === item.id}
                  item={item}
                  onSelect={() => {
                    if (item.id === 'home') model.openHome();
                    else if (!item.disabled) model.setActiveView(item.id);
                  }}
                />
              ))}
            </nav>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {recentEntries.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Recents</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {recentEntries.map(({ entity, recent }) => {
                    const label = noteFileName(entity);
                    return (
                      <SidebarMenuItem key={recent.entityId}>
                        <SidebarMenuButton tooltip={label} onClick={() => model.openEntity(entity)}>
                          <IconFile aria-hidden="true" />
                          <span>{label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupAction aria-label="New folder" onClick={() => setNewProjectOpen(true)}>
              <IconFolderPlus aria-hidden="true" />
            </SidebarGroupAction>
            {/* Dropping on the group itself, rather than on any folder, is
                what takes a note back out to the workspace root. */}
            <WorkspaceDropRegion
              onDropFolder={(folderId) => moveFolderById(folderId, null)}
              onDropNote={(noteId) => moveNoteById(noteId, null)}
            >
              <SidebarMenu>
                {folderTree.map((project, index) => (
                  <ProjectFolder
                    key={project.id}
                    activeNoteId={activeNoteId}
                    childFolders={project.children}
                    defaultOpen={index === 0}
                    notesByProject={notesByProject}
                    project={project}
                    projectNotes={notesByProject.get(project.id) ?? []}
                    revealedProjectId={model.revealedProjectId}
                    onCreateFolder={(name, parentId) => model.addProject({ name, parentId })}
                    onCreateNote={(projectId) => model.addNote({ projectId })}
                    onDelete={model.removeProject}
                    onDeleteNote={model.removeNote}
                    onDropFolder={moveFolderById}
                    onDropNote={moveNoteById}
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
                {workspaceIsEmpty && (
                  <SidebarMenuItem>
                    <p className="px-2 py-1 text-muted-foreground text-xs">
                      Nothing here yet. Notes are Markdown files in your workspace folder.
                    </p>
                  </SidebarMenuItem>
                )}
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => model.addNote()}>
                    <IconPlus aria-hidden="true" />
                    <span>New note</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </WorkspaceDropRegion>
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
    </TreeDropContext.Provider>
  );
}
