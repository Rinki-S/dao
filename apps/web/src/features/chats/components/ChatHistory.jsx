import { useState } from 'react';
import { IconMessageCircle, IconPlus, IconTrash } from '@tabler/icons-react';

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
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar.jsx';

import { useConversations } from '../use-conversations.js';

function RenameDialog({ conversation, open, onOpenChange, onSubmit }) {
  const [value, setValue] = useState('');
  // The dialog stays mounted so it can animate out, so the field is seeded on
  // each open rather than by a fresh mount.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(conversation?.title ?? '');
  }

  async function submit(event) {
    event.preventDefault();
    const title = value.trim();
    if (!title) return;
    await onSubmit(title);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Rename conversation</DialogTitle>
        </DialogHeader>
        <form className="contents" onSubmit={submit}>
          <DialogPanel>
            <Field>
              <FieldLabel>Title</FieldLabel>
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

function ConversationRow({ active, conversation, onOpen, onRename, onDelete }) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // A conversation is titled from its first turn, so one can genuinely have no
  // title yet. The same word is used in the pane's header, so the row and the
  // header never give one thing two names.
  const label = conversation.title || 'Untitled';

  return (
    <>
      <SidebarMenuItem>
        <ContextMenu>
          <ContextMenuTrigger>
            <SidebarMenuButton isActive={active} tooltip={label} onClick={onOpen}>
              <IconMessageCircle aria-hidden="true" />
              <span>{label}</span>
            </SidebarMenuButton>
          </ContextMenuTrigger>
          <ContextMenuPopup>
            <ContextMenuItem onClick={onOpen}>Open</ContextMenuItem>
            <ContextMenuItem onClick={() => setRenameOpen(true)}>Rename</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              <IconTrash aria-hidden="true" />
              Delete
            </ContextMenuItem>
          </ContextMenuPopup>
        </ContextMenu>
      </SidebarMenuItem>

      <RenameDialog
        conversation={conversation}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        onSubmit={(title) => onRename(title)}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The conversation and every turn in it will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <AlertDialogClose render={<Button variant="destructive" />} onClick={onDelete}>
              Delete conversation
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}

/**
 * The conversation list, as a section of the app's own sidebar.
 *
 * It sits where Recents and the workspace tree sit on the other views. A second
 * sidebar beside the first was two lists of the same kind of thing competing
 * for the same corner of the window, and the narrower one always lost. What is
 * being browsed changes with the view; the place you browse from does not.
 */
export function ChatHistory() {
  const { conversations, selectedId, select, startNew, rename, remove } = useConversations();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Chats</SidebarGroupLabel>
      <SidebarGroupAction aria-label="New chat" onClick={startNew}>
        <IconPlus aria-hidden="true" />
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              active={conversation.id === selectedId}
              conversation={conversation}
              onDelete={() => remove(conversation)}
              onOpen={() => select(conversation.id)}
              onRename={(title) => rename(conversation, title)}
            />
          ))}

          {conversations.length === 0 && (
            <SidebarMenuItem>
              <p className="px-2 py-1 text-muted-foreground text-xs">
                No conversations yet. Ask the model something to start one.
              </p>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
