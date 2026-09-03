import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconAlertTriangle,
  IconInfoCircle,
  IconMessageCircle,
  IconPlayerStop,
  IconSend,
  IconTool,
} from '@tabler/icons-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert.jsx';
import { Button } from '@/components/ui/button.jsx';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.jsx';
import { ScrollArea } from '@/components/ui/scroll-area.jsx';
import { Spinner } from '@/components/ui/spinner.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { useTitlebarInset } from '@/components/shell/use-titlebar-inset.js';
import { cn } from '@/lib/utils';
import { Markdown } from './Markdown.jsx';
import { ProposalCard } from './ProposalCard.jsx';
import { useConversations } from '../use-conversations.js';
import {
  CHAT_OUTCOMES,
  createConversation,
  getConversation,
  resolveProposal,
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
  // Not a breakage either. The decision was made — in another window, or by a
  // second press — and what this one is holding is out of date.
  [CHAT_OUTCOMES.answered]: {
    variant: 'info',
    icon: IconInfoCircle,
    title: 'That change was already answered',
    description: 'Open the conversation again to see what happened to it.',
  },
};

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
    case 'edit_note':
      // Worked out, not made. The card below the turn is what says what the
      // change is; this line only has to avoid implying the note was written.
      return 'Prepared a change to a note';
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

      {/* A line, not an alert. Stopping is something the reader did on purpose,
          and dressing it in an error's colour would report their own decision
          back to them as a problem. */}
      {message.status === 'stopped' ? (
        <p className="flex items-center gap-2 text-muted-foreground text-xs">
          <IconPlayerStop aria-hidden="true" className="size-3.5 shrink-0" />
          {message.content ? 'You stopped this reply' : 'You stopped this reply before it began'}
        </p>
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

  // Which conversation is open, and the list it came from, belong to the
  // sidebar as much as to this pane, so both read them from the same place.
  const { selected, selectedId, select, refresh } = useConversations();

  // The transcript and the last refusal, each tagged with the conversation it
  // belongs to.
  //
  // Tagged rather than cleared, because the pane is no longer what leaves a
  // conversation — New chat and Delete are both in the sidebar now, and neither
  // can reach in here to empty anything. Asking "is this still about what is
  // open?" answers that on the render it happens, where an effect would answer
  // it one render late and show the previous conversation's turns underneath
  // the new one's title.
  const [transcript, setTranscript] = useState({ id: null, messages: [] });
  const [problem, setProblem] = useState({ id: null, outcome: null, failure: '' });

  // The changes this conversation has proposed, answered or not, tagged the
  // same way and for the same reason.
  //
  // Beside the transcript rather than inside it: a change is recorded while the
  // tool runs, before the turn that asked for it has been stored, so for the
  // moment between the two there is no message to hang it on. They are joined
  // where they are drawn, by the id of the call that proposed it.
  const [changes, setChanges] = useState({ id: null, items: [] });

  // Memoised only so its identity is stable: the effect that follows the answer
  // down the page depends on it, and a fresh [] every render would scroll on
  // every render.
  const messages = useMemo(
    () => (transcript.id === selectedId ? transcript.messages : []),
    [transcript, selectedId],
  );
  const outcome = problem.id === selectedId ? problem.outcome : null;
  const failure = problem.id === selectedId ? problem.failure : '';
  const proposed = useMemo(
    () => (changes.id === selectedId ? changes.items : []),
    [changes, selectedId],
  );

  const [draft, setDraft] = useState('');
  // The turn in flight: what the user just said, what is being looked up, and
  // the reply so far.
  const [pending, setPending] = useState('');
  const [activity, setActivity] = useState([]);
  const [streaming, setStreaming] = useState('');
  const [sending, setSending] = useState(false);

  const bottom = useRef(null);
  // The turn in flight, in refs as well as in state.
  //
  // Stopping reads them from inside a catch, where the state captured when the
  // send began is the state as it was then — an empty reply and no id. The refs
  // are what the reader was actually shown by the time they pressed the button.
  const running = useRef(null);
  const streamed = useRef('');
  const streamedTools = useRef([]);
  const assistantId = useRef('');
  // The conversation whose turns are already in hand.
  //
  // Selecting one is not the only way to arrive at it: sending the first
  // message of a new chat also selects the conversation it just created, and
  // without this the load below would fire mid-answer and overwrite a reply
  // still being streamed with the half-written row the service holds.
  const loaded = useRef(null);

  // Nothing to load for a conversation that does not exist yet, and nothing to
  // clear for one that was left: what is shown is derived above. So this only
  // ever reads.
  useEffect(() => {
    if (!selectedId || loaded.current === selectedId) return undefined;

    let cancelled = false;
    loaded.current = selectedId;

    getConversation(selectedId)
      .then((detail) => {
        if (cancelled) return;

        setTranscript({ id: selectedId, messages: detail.messages });
        // Read back with the turns, so a change nobody answered is still
        // waiting after a reload and one somebody answered still says so.
        setChanges({ id: selectedId, items: detail.proposals });
      })
      .catch(() => {
        if (cancelled) return;

        setTranscript({ id: selectedId, messages: [] });
        setChanges({ id: selectedId, items: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // One turn onto the end of a conversation's transcript. The id travels with
  // it so a reply that lands after the reader has moved on is filed against the
  // conversation it belongs to rather than appended to whatever is on screen.
  function addTurn(conversationId, message) {
    setTranscript((current) => ({
      id: conversationId,
      messages: current.id === conversationId ? [...current.messages, message] : [message],
    }));
  }

  // One change onto the conversation it belongs to, replacing it if it is
  // already held: the same row arrives from the stream and from a reload, and
  // two copies of one change would be two sets of buttons for one decision.
  function keepChange(conversationId, proposal) {
    setChanges((current) => {
      const held = current.id === conversationId ? current.items : [];

      return {
        id: conversationId,
        items: held.some((change) => change.id === proposal.id)
          ? held.map((change) => (change.id === proposal.id ? proposal : change))
          : [...held, proposal],
      };
    });
  }

  // Following the answer as it is written is the whole point of streaming it.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages, streaming, pending, activity, proposed]);

  /**
   * Everything that happens after a turn's request is opened.
   *
   * Shared by the two ways a turn can start — somebody said something, or
   * somebody answered a change the model prepared. The difference between them
   * is entirely in what comes before; after that it is the same events in the
   * same order, and this is the part with all the ways to get it wrong: what to
   * keep when a stream dies, what to call a reader who pressed stop, what to
   * store so the pane and a reload agree.
   */
  async function carry(conversationId, begin, { restore = '' } = {}) {
    setActivity([]);
    setStreaming('');
    setSending(true);
    setProblem({ id: conversationId, outcome: null, failure: '' });

    running.current = new AbortController();
    streamed.current = '';
    streamedTools.current = [];
    assistantId.current = '';

    try {
      const reply = await begin({
        // The stored user turn replaces the local one: it carries the id,
        // position and timestamp only the service could assign. It is absent
        // when nobody said anything, which is how a turn picked up after a
        // change was answered begins.
        onStart: (start) => {
          assistantId.current = start.assistantMessageId;
          setPending('');
          if (start.userMessage) addTurn(conversationId, start.userMessage);
        },
        onDelta: (text) => {
          streamed.current += text;
          setStreaming((current) => current + text);
        },
        onTool: (call) => {
          streamedTools.current = [...streamedTools.current, call];
          setActivity((current) => [...current, call]);
        },
        // Where a change stands, said by the side that knows. It arrives when a
        // turn stops to ask, and again at the top of the stream that follows an
        // answer — the card is drawn from this row exactly as stored, so what is
        // agreed to is what would be written, and what is shown afterwards is
        // what was actually recorded rather than what this pane sent.
        onProposal: (proposal) => keepChange(conversationId, proposal),
        signal: running.current.signal,
      });

      addTurn(conversationId, reply);
      // Cleared together with the streamed text: the stored turn that just
      // landed carries the same calls, so leaving these would show each of them
      // twice.
      setActivity([]);
      setStreaming('');

      // Re-read rather than patched in place: the first turn gives a
      // conversation its title, and every turn changes the order of the list.
      await refresh();
    } catch (error) {
      // Stopping is not a failure, and it is the one path with no done event to
      // end on — the reader ended the stream, so nothing arrives after it. The
      // turn is built from what they were actually shown, which is also what
      // the service stored on its side of the same connection.
      if (error.name === 'AbortError') {
        addTurn(conversationId, {
          id: assistantId.current || 'stopped',
          conversationId: conversationId ?? '',
          role: 'assistant',
          content: streamed.current,
          position: messages.length,
          model: '',
          wire: '',
          inputTokens: 0,
          outputTokens: 0,
          status: 'stopped',
          errorMessage: '',
          createdAt: '',
          // Carried onto the turn rather than dropped with the live lines.
          // The service stored them, so a reload shows them; the pane should
          // not disagree with itself for the rest of the session.
          toolCalls: streamedTools.current,
        });
        setPending('');
        setActivity([]);
        setStreaming('');

        // A stopped turn still made a conversation, and one missing from the
        // list until the next reload is one the reader cannot get back to.
        await refresh();

        return;
      }

      setProblem({
        id: conversationId,
        outcome: error.outcome ?? CHAT_OUTCOMES.failed,
        failure: error.message,
      });
      setPending('');
      setActivity([]);
      setStreaming('');
      // Nothing was sent, so the words are handed back rather than lost to a
      // failure the user is about to be asked to do something about. There are
      // none to hand back when the turn was started by a decision.
      if (restore) setDraft((current) => current || restore);
    } finally {
      running.current = null;
      setSending(false);
    }
  }

  async function submit(event) {
    event.preventDefault();

    const content = draft.trim();
    if (!content || sending || !workspaceId) return;

    setDraft('');
    setPending(content);
    // Before the conversation is created, not after: creating one is a request
    // of its own, and a second press while it is in flight would create a
    // second conversation to send the same question to.
    setSending(true);

    // Hoisted out of the try so the catch can file what it builds against the
    // conversation the turn was actually sent to, which may have been created
    // by this send rather than selected before it.
    let conversationId = selectedId;

    try {
      // Lazily, so the list only ever holds conversations with something in
      // them. The id is needed before the turn can be sent either way.
      if (!conversationId) {
        const conversation = await createConversation(workspaceId);
        conversationId = conversation.id;
        // Marked loaded before it is selected: this pane already holds the
        // conversation, which is empty, and reading it back would race the
        // turn about to be streamed into it.
        loaded.current = conversation.id;
        setTranscript({ id: conversation.id, messages: [] });
        setChanges({ id: conversation.id, items: [] });
        select(conversation.id);
      }
    } catch (error) {
      setProblem({
        id: selectedId,
        outcome: error.outcome ?? CHAT_OUTCOMES.failed,
        failure: error.message,
      });
      setPending('');
      setSending(false);
      setDraft((current) => current || content);

      return;
    }

    // Saying something else instead of answering is an answer: no. Nothing here
    // has to arrange for the card to say so — the service sets aside whatever
    // was waiting before it stores this turn, and sends the row it set aside.
    await carry(conversationId, (events) => sendMessage(conversationId, content, events), {
      restore: content,
    });
  }

  /**
   * Answer a change the model prepared, and let the turn carry on.
   *
   * The decision is all that is sent. What gets written is read by the service
   * from the row that was shown, so there is nothing here that could confirm
   * something other than what the person read.
   *
   * And what the card says afterwards comes back down the stream. Guessing it
   * from the decision would be wrong in exactly the case that matters: an apply
   * a note refused is not an apply, and only the code that tried to write knows
   * which happened.
   */
  async function decide(proposal, decision) {
    if (sending) return;

    const conversationId = proposal.conversationId || selectedId;
    if (!conversationId) return;

    await carry(conversationId, (events) =>
      resolveProposal(conversationId, proposal.id, decision, events),
    );
  }

  // Aborting the request is the whole mechanism. The connection closing is what
  // tells the service to stop, which is the same thing it already does when a
  // window is closed mid-answer — so there is no second code path, and no way
  // for the model to keep spending on an answer nobody is waiting for.
  function stop() {
    running.current?.abort();
  }

  const refusal = outcome ? OUTCOMES[outcome] : null;
  const RefusalIcon = refusal?.icon ?? IconAlertTriangle;
  const empty = messages.length === 0 && !pending && !streaming && activity.length === 0;

  // A change is drawn under the turn that asked for it, found through the call
  // it was recorded against — which is why the transcript keeps call ids it
  // never shows anybody.
  const under = (message) => {
    const calls = new Set((message.toolCalls ?? []).map((call) => call.id).filter(Boolean));

    return proposed.filter((change) => calls.has(change.toolCallId));
  };

  // A change whose turn is not in hand yet, which is the state between the
  // proposal event and the done event that carries the row holding its call.
  // Drawn at the end rather than held back: it is the thing the conversation is
  // stopped on, and a card that appeared a second later would be a card that
  // was missing when somebody looked.
  const placed = new Set(
    messages.flatMap((message) => (message.toolCalls ?? []).map((call) => call.id)),
  );
  const loose = proposed.filter((change) => !placed.has(change.toolCallId));

  return (
    <section aria-label="Chats" className="flex h-full min-h-0 flex-col">
      {/* The surface's own top bar, and the only one now that the conversation
          list lives in the app's sidebar. Same height and inset as Today and
          Search, which is what keeps the traffic lights optically centred and
          leaves the band draggable.

          px-4 rather than their px-2, because what sits here is not a fixed
          label naming the view — it is the conversation's own title, content
          rather than chrome, and at 8px it reads as having fallen against the
          sidebar's edge instead of starting there. */}
      <header
        className={cn('flex h-12 shrink-0 items-center gap-2 border-b px-4', titlebarInset.padding)}
      >
        <div className={cn(titlebarInset.drag, 'flex min-w-0 flex-1 items-baseline')}>
          <h1 className="truncate font-heading font-semibold text-sm">
            {/* Three states, not two. Nothing selected is a new chat; a
                conversation whose title has not been derived yet is untitled,
                and calling that "New chat" would give the row in the sidebar
                and the header above it two different names for one thing. */}
            {selected ? selected.title || 'Untitled' : 'New chat'}
          </h1>
        </div>
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
            <Fragment key={message.id}>
              <Turn message={message} />
              {under(message).map((change) => (
                <ProposalCard busy={sending} key={change.id} proposal={change} onDecide={decide} />
              ))}
            </Fragment>
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

          {loose.map((change) => (
            <ProposalCard busy={sending} key={change.id} proposal={change} onDecide={decide} />
          ))}

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
          {/* The same corner, so the button that started the reply is the
                button that ends it — and type="button" while it stops, or
                pressing it would submit the form it sits in. It is never
                disabled: the moment a reply is worth stopping is exactly the
                moment it is running. */}
          {sending ? (
            <Button aria-label="Stop" size="icon" type="button" variant="outline" onClick={stop}>
              <IconPlayerStop aria-hidden="true" />
            </Button>
          ) : (
            <Button
              aria-label="Send"
              disabled={!draft.trim() || !workspaceId}
              size="icon"
              type="submit"
            >
              <IconSend aria-hidden="true" />
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
