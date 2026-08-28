import { useEffect, useRef, useState } from 'react';
import {
  IconAlertTriangle,
  IconInfoCircle,
  IconMessageCircle,
  IconPlus,
  IconSend,
  IconTool,
  IconTrash,
} from '@tabler/icons-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert.jsx';
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.jsx';
import { Field, FieldLabel } from '@/components/ui/field.jsx';
import { Input } from '@/components/ui/input.jsx';
import { ScrollArea } from '@/components/ui/scroll-area.jsx';
import { Spinner } from '@/components/ui/spinner.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { useTitlebarInset } from '@/components/shell/use-titlebar-inset.js';
import { cn } from '@/lib/utils';
import { Markdown } from './Markdown.jsx';
import {
  CHAT_OUTCOMES,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  sendMessage,
} from '../api.js';

// Each refusal, with the variant that says what kind of thing it is. No model
// connected is not a breakage, so it does not get an error's colour.
const OUTCOMES = {
  [CHAT_OUTCOMES.notConfigured]: {
    variant: 'info',
    icon: IconInfoCircle,
    title: 'No model connected',
    description: 'Add a provider in Settings to start a conversation.',
    settings: true,
  },
  [CHAT_OUTCOMES.keyRejected]: {
    variant: 'error',
    icon: IconAlertTriangle,
    title: 'The provider rejected the API key',
    description: 'Check the key in Settings.',
    settings: true,
  },
  [CHAT_OUTCOMES.rateLimited]: {
    variant: 'warning',
    icon: IconAlertTriangle,
    title: 'The provider is rate limiting',
    description: 'Try again shortly.',
  },
  [CHAT_OUTCOMES.missing]: {
    variant: 'error',
    icon: IconAlertTriangle,
    title: 'That conversation is gone',
    description: 'It was deleted somewhere else. Start a new one.',
  },
};

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

/**
 * What a tool did, in words.
 *
 * The service sends the name and the arguments and no phrasing, so this is
 * where the sentence gets written. The query is shown rather than left out
 * because "searched your notes" and "searched your notes for parser" are
 * different claims, and only the second is one the reader can check against
 * what they know is in there.
 */
function describeTool({ name, input }) {
  // A model can write arguments that are not JSON. The tool will have refused
  // them, and the name is still worth saying.
  let args;
  try {
    args = JSON.parse(input || '{}');
  } catch {
    args = {};
  }

  switch (name) {
    case 'search_notes':
      return args.query ? `Searched your notes for “${args.query}”` : 'Searched your notes';
    case 'read_note':
      // The id is not shown: it means nothing to the person reading, and the
      // title is not something this side was given.
      return 'Read a note';
    case 'read_tasks':
      return 'Read your task list';
    default:
      // A tool this build has not heard of still gets a line. Saying nothing
      // would hide that the model did something.
      return `Ran ${name}`;
  }
}

/**
 * What the model looked up before answering.
 *
 * Shown for a stored turn as well as a live one. The question this app has to
 * be able to answer about itself is "did it read my notes?", and an answer that
 * only appeared while it was being written does not answer it tomorrow.
 */
function ToolActivity({ calls }) {
  // Guarded rather than trusted. The schema defaults this to an empty array, so
  // it is always there — but a turn is not worth losing over a missing field,
  // and rendering nothing is a better failure than taking down the transcript
  // it was meant to annotate.
  if (!calls || calls.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1">
      {calls.map((call, index) => (
        <li className="flex items-center gap-2 text-muted-foreground text-xs" key={index}>
          <IconTool aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{describeTool(call)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One turn.
 *
 * What the user wrote stays text: they typed it, they know what it says, and a
 * question that renders its own asterisks as emphasis is surprising in a way
 * nothing gains from. The reply is rendered, because the model was asked to
 * write Markdown and does.
 */
function Turn({ message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ToolActivity calls={message.toolCalls} />
      {/* No wrapper for size or spacing: the reply brings its own, so that a
          note and a reply are laid out by the same rules. */}
      {message.content ? <Markdown text={message.content} /> : null}
      {message.status === 'failed' ? (
        <Alert variant="error">
          <IconAlertTriangle />
          <AlertTitle>
            {message.content ? 'This reply stops mid-thought' : 'This reply never arrived'}
          </AlertTitle>
          <AlertDescription>{message.errorMessage}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

/**
 * Chats: a conversation with the configured model.
 *
 * A conversation is created when its first message is sent, not when the New
 * button is pressed. Pressing New only clears the pane, so a list of
 * conversations is a list of conversations that contain something — thinking
 * better of a question should not leave a row behind.
 */
export function ChatsWorkspace({ model, onOpenSettings }) {
  const titlebarInset = useTitlebarInset();
  const workspaceId = model.currentWorkspace?.id ?? '';

  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  // The turn in flight: what the user just said, what is being looked up, and
  // the reply so far.
  const [pending, setPending] = useState('');
  const [activity, setActivity] = useState([]);
  const [streaming, setStreaming] = useState('');
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [failure, setFailure] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const bottom = useRef(null);
  // The conversation whose turns are already in hand.
  //
  // Selecting one is not the only way to arrive at it: sending the first
  // message of a new chat also selects the conversation it just created, and
  // without this the load below would fire mid-answer and overwrite a reply
  // still being streamed with the half-written row the service holds.
  const loaded = useRef(null);

  useEffect(() => {
    if (!workspaceId) return undefined;

    let cancelled = false;

    listConversations(workspaceId)
      .then((next) => {
        if (!cancelled) setConversations(next);
      })
      .catch(() => {
        if (!cancelled) setConversations([]);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    // Nothing to load for a conversation that does not exist yet. Clearing the
    // pane is the job of whoever left it — starting a new chat, or deleting the
    // one that was open — so this effect only ever reads.
    if (!selectedId || loaded.current === selectedId) return undefined;

    let cancelled = false;
    loaded.current = selectedId;

    getConversation(selectedId)
      .then((detail) => {
        if (!cancelled) setMessages(detail.messages);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Following the answer as it is written is the whole point of streaming it.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages, streaming, pending, activity]);

  function startNew() {
    loaded.current = null;
    setSelectedId(null);
    setMessages([]);
    setOutcome(null);
    setFailure('');
  }

  async function submit(event) {
    event.preventDefault();

    const content = draft.trim();
    if (!content || sending || !workspaceId) return;

    setDraft('');
    setPending(content);
    setActivity([]);
    setStreaming('');
    setSending(true);
    setOutcome(null);
    setFailure('');

    try {
      // Lazily, so the list only ever holds conversations with something in
      // them. The id is needed before the turn can be sent either way.
      let conversationId = selectedId;
      if (!conversationId) {
        const conversation = await createConversation(workspaceId);
        conversationId = conversation.id;
        // Marked loaded before it is selected: this pane already holds the
        // conversation, which is empty, and reading it back would race the
        // turn about to be streamed into it.
        loaded.current = conversation.id;
        setSelectedId(conversation.id);
      }

      const reply = await sendMessage(conversationId, content, {
        // The stored user turn replaces the local one: it carries the id,
        // position and timestamp only the service could assign.
        onStart: (start) => {
          setPending('');
          setMessages((current) => [...current, start.userMessage]);
        },
        onDelta: (text) => setStreaming((current) => current + text),
        onTool: (call) => setActivity((current) => [...current, call]),
      });

      setMessages((current) => [...current, reply]);
      // Cleared together with the streamed text: the stored turn that just
      // landed carries the same calls, so leaving these would show each of them
      // twice.
      setActivity([]);
      setStreaming('');

      // Re-read rather than patched in place: the first turn gives a
      // conversation its title, and every turn changes the order of the list.
      setConversations(await listConversations(workspaceId));
    } catch (error) {
      setOutcome(error.outcome ?? CHAT_OUTCOMES.failed);
      setFailure(error.message);
      setPending('');
      setActivity([]);
      setStreaming('');
      // Nothing was sent, so the words are handed back rather than lost to a
      // failure the user is about to be asked to do something about.
      setDraft((current) => current || content);
    } finally {
      setSending(false);
    }
  }

  async function rename(title) {
    const updated = await renameConversation(renaming.id, title);
    setConversations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function remove(conversation) {
    await deleteConversation(conversation.id);
    setConversations((current) => current.filter((item) => item.id !== conversation.id));
    if (conversation.id === selectedId) startNew();
  }

  const selected = conversations.find((item) => item.id === selectedId) ?? null;
  const refusal = outcome ? OUTCOMES[outcome] : null;
  const RefusalIcon = refusal?.icon ?? IconAlertTriangle;
  const empty = messages.length === 0 && !pending && !streaming && activity.length === 0;

  return (
    <section aria-label="Chats" className="flex h-full min-h-0">
      <div className="flex w-60 shrink-0 flex-col border-e">
        <header
          className={cn(
            'flex h-12 shrink-0 items-center gap-2 border-b px-2',
            titlebarInset.padding,
          )}
        >
          <div className={cn(titlebarInset.drag, 'flex min-w-0 flex-1 items-baseline')}>
            <h1 className="font-heading font-semibold text-sm">Chats</h1>
          </div>
          <Button
            aria-label="New chat"
            disabled={!workspaceId}
            size="icon-sm"
            variant="ghost"
            onClick={startNew}
          >
            <IconPlus aria-hidden="true" />
          </Button>
        </header>

        <ScrollArea className="min-h-0 flex-1" overscrollContain>
          <ul className="flex flex-col gap-0.5 p-2">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <ContextMenu>
                  <ContextMenuTrigger>
                    <button
                      aria-current={conversation.id === selectedId ? 'true' : undefined}
                      className={cn(
                        'w-full truncate rounded-md px-2 py-1.5 text-start text-sm hover:bg-accent',
                        conversation.id === selectedId && 'bg-accent',
                      )}
                      type="button"
                      onClick={() => setSelectedId(conversation.id)}
                    >
                      {conversation.title || 'Untitled'}
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuPopup>
                    <ContextMenuItem onClick={() => setRenaming(conversation)}>
                      Rename
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      variant="destructive"
                      onClick={() => setDeleting(conversation)}
                    >
                      <IconTrash aria-hidden="true" />
                      Delete
                    </ContextMenuItem>
                  </ContextMenuPopup>
                </ContextMenu>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <h2 className="truncate font-heading font-semibold text-sm">
            {/* Three states, not two. Nothing selected is a new chat; a
                conversation whose title has not been derived yet is untitled,
                and calling that "New chat" would give the row in the list and
                the header above it two different names for one thing. */}
            {selected ? selected.title || 'Untitled' : 'New chat'}
          </h2>
        </header>

        <ScrollArea className="min-h-0 flex-1" overscrollContain>
          <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
            {empty ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconMessageCircle aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Ask the model something</EmptyTitle>
                  <EmptyDescription>
                    This conversation is sent to the provider configured in Settings. Your notes and
                    tasks are not.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}

            {messages.map((message) => (
              <Turn key={message.id} message={message} />
            ))}

            {pending ? (
              <div className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm opacity-64">
                  {pending}
                </p>
              </div>
            ) : null}

            <ToolActivity calls={activity} />

            {/* Rendered while it streams, not only once it lands, so the reply
                does not visibly re-lay-itself-out the moment it finishes.
                final={false} is what tells the renderer that a half-written
                fence is a fence still being written rather than a stray
                backtick. */}
            {streaming ? <Markdown final={false} text={streaming} /> : null}

            {sending && !streaming && activity.length === 0 ? <Spinner aria-hidden="true" /> : null}

            {/* The reply is announced as a state, not as text. A live region
                carrying every token as it lands would read the answer out one
                fragment at a time. */}
            <p aria-live="polite" className="sr-only" role="status">
              {sending ? 'Writing a reply' : ''}
            </p>

            {refusal ? (
              <Alert variant={refusal.variant}>
                <RefusalIcon />
                <AlertTitle>{refusal.title}</AlertTitle>
                <AlertDescription>{refusal.description}</AlertDescription>
                {refusal.settings ? (
                  <AlertAction>
                    <Button size="xs" variant="outline" onClick={onOpenSettings}>
                      Open Settings
                    </Button>
                  </AlertAction>
                ) : null}
              </Alert>
            ) : null}

            {outcome && !refusal ? (
              <Alert variant="error">
                <IconAlertTriangle />
                <AlertTitle>The reply did not arrive</AlertTitle>
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            ) : null}

            <div ref={bottom} />
          </div>
        </ScrollArea>

        <form className="shrink-0 border-t p-4" onSubmit={submit}>
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <Textarea
              aria-label="Message"
              disabled={!workspaceId}
              placeholder="Ask something…"
              size="sm"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter breaks the line. The other way round
                // is defensible, but every other chat works this way and muscle
                // memory is not something to be clever with.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button
              aria-label="Send"
              disabled={!draft.trim() || !workspaceId}
              loading={sending}
              size="icon"
              type="submit"
            >
              <IconSend aria-hidden="true" />
            </Button>
          </div>
        </form>
      </div>

      <RenameDialog
        conversation={renaming}
        open={Boolean(renaming)}
        onOpenChange={(open) => !open && setRenaming(null)}
        onSubmit={rename}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title || 'Untitled'}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The conversation and every turn in it will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={() => remove(deleting)}
            >
              Delete conversation
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </section>
  );
}
