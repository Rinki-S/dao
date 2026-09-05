import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconAlertTriangle,
  IconArrowUp,
  IconInfoCircle,
  IconPaperclip,
  IconMessageCircle,
  IconPlayerStop,
  IconRefresh,
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
import { InputGroup, InputGroupAddon, InputGroupTextarea } from '@/components/ui/input-group.jsx';
import { ScrollArea } from '@/components/ui/scroll-area.jsx';
import { useTitlebarInset } from '@/components/shell/use-titlebar-inset.js';
import { cn } from '@/lib/utils';
import { Attachments } from './Attachments.jsx';
import { Markdown } from './Markdown.jsx';
import { Thinking } from './Thinking.jsx';
import { ProposalCard } from './ProposalCard.jsx';
import { ReplyDots } from './ReplyDots.jsx';
import { interleave } from '../interleave.js';
import { useConversations } from '../use-conversations.js';
import {
  CHAT_OUTCOMES,
  createConversation,
  describeAttachments,
  getConversation,
  resolveProposal,
  retryMessage,
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
    // Worked out, not made. The card below the turn is what says what each
    // change is; these lines only have to avoid implying it already happened.
    // Every one of them is in the past tense about the preparing and silent
    // about the file, which is the distinction the whole feature rests on.
    case 'edit_note':
      return 'Prepared a change to a note';
    case 'create_note':
      return args.title ? `Drafted a note called “${args.title}”` : 'Drafted a new note';
    case 'edit_tasks':
      return 'Prepared a change to your task list';
    case 'rename_note':
      return args.title ? `Suggested renaming a note to “${args.title}”` : 'Suggested a new name';
    case 'delete_note':
      return 'Asked about deleting a note';
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
function ToolLine({ call }) {
  return (
    <p className="flex items-center gap-2 text-muted-foreground text-xs">
      <IconTool aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{describeTool(call)}</span>
    </p>
  );
}

/**
 * A reply, with each tool line where the model ran it.
 *
 * Not every call above the answer, which is what a turn stored as one run of
 * prose and one list of calls invites. The model says something, goes and
 * looks, and carries on — and a transcript that gathers the looking above the
 * saying reads as though it had done all of it before speaking.
 *
 * The prose is rendered in pieces, which is the cost. Only the last piece is
 * final: the ones before it are followed by more of the same reply, and
 * telling the renderer so is what keeps a list or a fence that continues past
 * a tool line from being read as finished at the cut.
 */
function Reply({ content, calls, final = true }) {
  const parts = useMemo(() => interleave(content ?? '', calls ?? []), [content, calls]);
  if (parts.length === 0) return null;

  const last = parts.findLast((part) => part.kind === 'text');

  return (
    <>
      {parts.map((part, index) =>
        part.kind === 'call' ? (
          <ToolLine call={part.call} key={index} />
        ) : (
          <Markdown final={final && part === last} key={index} text={part.text} />
        ),
      )}
    </>
  );
}

/** A token count, short enough to sit in a header. */
function compact(tokens) {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0)}k`;

  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

/**
 * What this conversation has cost, in tokens.
 *
 * Tokens rather than money, and that is not a shortcut. Dao lets somebody
 * point at any endpoint with any model name, so there is no honest way to
 * price a call here — a figure in dollars would be this app inventing a rate
 * card for a provider it was told nothing about. The counts are what the
 * provider actually reported, which is the part that is true.
 *
 * A running total rather than a per-turn figure. What somebody wants to know
 * is whether this conversation has become expensive, and no single turn
 * answers that — a long thread is expensive because every turn re-sends the
 * ones before it, which is exactly the thing a total makes visible and a
 * per-turn number hides.
 */
function Cost({ messages }) {
  const spent = useMemo(
    () =>
      messages.reduce(
        (total, message) => ({
          input: total.input + (message.inputTokens ?? 0),
          output: total.output + (message.outputTokens ?? 0),
        }),
        { input: 0, output: 0 },
      ),
    [messages],
  );

  if (spent.input === 0 && spent.output === 0) return null;

  return (
    <p
      className="shrink-0 text-muted-foreground text-xs tabular-nums"
      title={`${spent.input.toLocaleString()} tokens sent, ${spent.output.toLocaleString()} received`}
    >
      {compact(spent.input)} in · {compact(spent.output)} out
    </p>
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
function Turn({ message, busy, showThinking, onRetry }) {
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {/* Above the words, the way they were attached: the file is picked
            and then something is said about it. */}
        <Attachments files={message.attachments} />
        {message.content ? (
          <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm">
            {message.content}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Above the tools and the reply, where it happened: the model thought,
          then looked things up, then answered. */}
      {showThinking ? <Thinking text={message.reasoning} /> : null}
      {/* No wrapper for size or spacing: the reply brings its own, so that a
          note and a reply are laid out by the same rules. */}
      <Reply calls={message.toolCalls} content={message.content} />
      {message.status === 'failed' ? (
        <Alert variant="error">
          <IconAlertTriangle />
          <AlertTitle>
            {message.content ? 'This reply stops mid-thought' : 'This reply never arrived'}
          </AlertTitle>
          <AlertDescription>{message.errorMessage}</AlertDescription>
          {/* Only on the turn that can actually be tried again, which is the
              last one. Offering it further up would be offering to answer a
              question the conversation has since moved past. */}
          {onRetry ? (
            <AlertAction>
              <Button disabled={busy} size="xs" variant="outline" onClick={onRetry}>
                <IconRefresh aria-hidden="true" />
                Try again
              </Button>
            </AlertAction>
          ) : null}
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
export function ChatsWorkspace({ model, showThinking = false, onOpenSettings }) {
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
  // The files staged against the turn not yet sent. Paths and names only —
  // nothing here has read a byte of them, and nothing needs to.
  const [staged, setStaged] = useState([]);
  // The turn in flight: what the user just said, what is being looked up, and
  // the reply so far.
  const [pending, setPending] = useState('');
  const [activity, setActivity] = useState([]);
  const [streaming, setStreaming] = useState('');
  // The working as it arrives. Held whether or not it is being shown: turning
  // the preference on halfway through a long think should reveal what has
  // already been thought, not start from wherever the reader happened to flip
  // the switch.
  const [working, setWorking] = useState('');
  const [sending, setSending] = useState(false);

  const bottom = useRef(null);
  // Whether the transcript should stay stuck to the end. True until somebody
  // scrolls away from it, and true again the moment they come back.
  const following = useRef(true);
  // The turn in flight, in refs as well as in state.
  //
  // Stopping reads them from inside a catch, where the state captured when the
  // send began is the state as it was then — an empty reply and no id. The refs
  // are what the reader was actually shown by the time they pressed the button.
  const running = useRef(null);
  const streamed = useRef('');
  const streamedWorking = useRef('');
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
    setTranscript((current) => {
      const held = current.id === conversationId ? current.messages : [];
      // Replaced when it is already there, appended when it is not. A retry
      // answers into the row that failed and comes back carrying its id, so
      // without this the conversation would grow a second copy of a turn it
      // already has.
      const at = held.findIndex((turn) => turn.id === message.id);

      return {
        id: conversationId,
        messages:
          at === -1
            ? [...held, message]
            : held.map((turn, index) => (index === at ? message : turn)),
      };
    });
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

  // Whether the reader is at the end of the transcript, and so whether the
  // pane should keep them there.
  //
  // Watched rather than measured. The alternative is comparing scrollTop
  // against scrollHeight on every token, which means reading layout during a
  // stream and picking a tolerance in pixels; an observer on the last element
  // answers the same question by looking at it, and answers it again for free
  // when the window is resized or the composer grows.
  useEffect(() => {
    const sentinel = bottom.current;
    if (!sentinel) return undefined;

    const watcher = new IntersectionObserver(
      ([entry]) => {
        following.current = entry.isIntersecting;
      },
      // The scroller itself, not the window. The transcript is clipped by the
      // scroll area, and the default root would be answering about a viewport
      // that is not the one doing the scrolling.
      { root: sentinel.closest('[data-slot="scroll-area-viewport"]') },
    );

    watcher.observe(sentinel);

    return () => watcher.disconnect();
  }, []);

  // Following the answer as it is written is the whole point of streaming it —
  // but only for somebody who was following it.
  //
  // Scrolling up during a reply is how you read what was said earlier, and a
  // pane that scrolled to the bottom on every token made that impossible: each
  // arriving word dragged the transcript back down out of the reader's hands.
  // So the effect asks first, and the answer is the state from before this
  // token arrived — the observer's callback runs at the end of the frame,
  // after this. Scrolling back to the bottom starts the following again,
  // because that is the same gesture as asking to be kept there.
  useEffect(() => {
    if (!following.current) return;

    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages, streaming, working, pending, activity, proposed]);

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
  async function carry(conversationId, begin, { restore = '', restoreAttachments = [] } = {}) {
    setActivity([]);
    setStreaming('');
    setWorking('');
    setSending(true);
    setProblem({ id: conversationId, outcome: null, failure: '' });

    running.current = new AbortController();
    streamed.current = '';
    streamedWorking.current = '';
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
        onReasoning: (text) => {
          streamedWorking.current += text;
          setWorking((current) => current + text);
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
      // landed carries the same calls and the same working, so leaving these
      // would show each of them twice.
      setActivity([]);
      setStreaming('');
      setWorking('');

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
          reasoning: streamedWorking.current,
        });
        setPending('');
        setActivity([]);
        setStreaming('');
        setWorking('');

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
      setWorking('');
      // Nothing was sent, so the words are handed back rather than lost to a
      // failure the user is about to be asked to do something about. There are
      // none to hand back when the turn was started by a decision.
      if (restore) setDraft((current) => current || restore);
      // And the files with them. A refused send that quietly dropped the
      // attachments would leave somebody retyping a question whose subject
      // they would have to go and find again.
      if (restoreAttachments.length > 0) {
        setStaged((current) => (current.length > 0 ? current : restoreAttachments));
      }
    } finally {
      running.current = null;
      setSending(false);
    }
  }

  /**
   * Stage files chosen through the desktop's own dialog.
   *
   * The dialog is the only way to learn a real path: a file input in a web
   * page hands back a name and a blob and deliberately not a location, and a
   * location is the whole of what gets stored.
   */
  async function chooseAttachments() {
    if (!window.dao?.chooseAttachments) return;

    let result;
    try {
      result = await window.dao.chooseAttachments();
    } catch (error) {
      // A button that does nothing is the worst way to fail, and this is the
      // one call in the pane that can fail without producing anything at all
      // to look at. The bridge is a process boundary: the renderer reloads on
      // save and the main process does not, so a build whose preload has moved
      // on from the running Electron rejects here with "no handler
      // registered" — silently, until this said so.
      setProblem({
        id: selectedId,
        outcome: CHAT_OUTCOMES.failed,
        failure: `The file chooser could not be opened: ${error.message}`,
      });

      return;
    }

    if (result?.canceled) return;

    // Described before they are staged, so a file too large or of a kind that
    // cannot be sent is refused now — while the dialog is still what somebody
    // is thinking about — rather than after they have written a message to go
    // with it. The service answers, because the service owns the rule.
    let described;
    try {
      described = await describeAttachments(result?.paths ?? []);
    } catch (error) {
      // The refusal names the file, which is the whole point of asking now:
      // somebody who has just chosen four things and one of them is a 30 MB
      // video needs to know which one.
      //
      // Nothing is staged when one is refused. Taking the rest would leave
      // them to work out which of their files is missing from a row of chips.
      setProblem({
        id: selectedId,
        outcome: error.outcome ?? CHAT_OUTCOMES.failed,
        failure: error.message,
      });

      return;
    }

    setStaged((current) => {
      // Keyed on the path, so choosing the same file twice stages it once. The
      // service would read it twice and the model would be shown it twice.
      const held = new Set(current.map((file) => file.path));

      return [...current, ...described.filter((file) => !held.has(file.path))];
    });
  }

  /**
   * Ask the model again for the turn that failed.
   *
   * The failed turn is taken off the transcript first, so the pane is not
   * showing an error and its replacement being written at the same time. It
   * comes back on the done event — as the new reply, or as the same failure
   * again if the second attempt goes the same way.
   */
  async function again(message) {
    if (sending || !selectedId) return;

    const conversationId = selectedId;
    setTranscript((current) => ({
      id: current.id,
      messages: current.messages.filter((turn) => turn.id !== message.id),
    }));

    await carry(conversationId, (events) => retryMessage(conversationId, message.id, events));
  }

  async function submit(event) {
    event.preventDefault();

    const content = draft.trim();
    // A file on its own is a message. What cannot be sent is nothing at all.
    if ((!content && staged.length === 0) || sending || !workspaceId) return;

    const attachments = staged;
    setDraft('');
    setStaged([]);
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
    await carry(
      conversationId,
      (events) => sendMessage(conversationId, content, { ...events, attachments }),
      { restore: content, restoreAttachments: attachments },
    );
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
    <section aria-label="Chats" className="relative flex h-full min-h-0 flex-col">
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
        {/* Beside the title rather than under the composer: it is a property
            of the conversation, and it should not move as one is written. */}
        <Cost messages={messages} />
      </header>

      <ScrollArea className="min-h-0 flex-1" overscrollContain>
        {/* Bottom padding rather than a margin, and generous: the last turn
            has to be able to scroll clear of the composer floating over it,
            and the composer grows as somebody types into it. */}
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pb-36">
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
              <Turn
                busy={sending}
                message={message}
                showThinking={showThinking}
                onRetry={
                  message.status === 'failed' && message.id === messages[messages.length - 1]?.id
                    ? () => again(message)
                    : undefined
                }
              />
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

          {showThinking ? <Thinking live text={working} /> : null}

          {/* Rendered while it streams, not only once it lands, so the reply
                does not visibly re-lay-itself-out the moment it finishes — and
                with the tool lines already in place, so a call does not jump
                from the top of the answer to the middle of it when the turn is
                stored. final={false} is what tells the renderer that a
                half-written fence is a fence still being written rather than a
                stray backtick. */}
          <Reply calls={activity} content={streaming} final={false} />

          {loose.map((change) => (
            <ProposalCard busy={sending} key={change.id} proposal={change} onDecide={decide} />
          ))}

          {sending && !streaming && activity.length === 0 && !(showThinking && working) ? (
            <ReplyDots />
          ) : null}

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

      {/* The composer floats over the transcript rather than sitting under a
          rule dividing the two. What separates them is the fade above it,
          which is the separation a page already makes: things nearer the
          bottom are on their way out of view. A hairline would have drawn a
          second edge across a pane that already has one under its header. */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        {/* Drawn above the composer rather than behind it: text has to be gone
            by the time it reaches the top edge of the box, or it reappears in
            the gap beside it.

            The only part of this band you can see through, and so the only
            part that has to let a click reach what is under it. The composer
            below is opaque, and passing clicks through that would hand them to
            text nobody can see. */}
        <div className="pointer-events-none h-12 bg-gradient-to-b from-transparent to-background" />

        <form className="bg-background px-4 pb-4" onSubmit={submit}>
          {/* The width and the centring live on a block wrapper, not on the
              group itself: an input group is inline-flex, and auto margins do
              not centre an inline-level box — it had been sitting against the
              left edge while the transcript above it was centred. */}
          <div className="mx-auto max-w-2xl">
            {/* The textarea is sized from here rather than from its own
                className, which lands on the control's wrapper and never
                reaches the element that has the height.

                Three things, all on the inner textarea. A floor shorter than
                the group's own, which is sized for a form field somebody
                composes in rather than a chat box that is usually one line. A
                ceiling, because the control grows with its content —
                field-sizing-content and nothing to stop it means a long
                question eventually eats the conversation it is about. And the
                scrolling that ceiling implies, said out loud rather than left
                to the default. Important throughout: the group sets the floor
                with a selector of the same shape, so these have to outrank it
                rather than tie with it. */}
            {/* The corner is concentric with the send button, not chosen.
                The button is size-7 and fully round, so its radius is 14px;
                it sits 11px inside the addon's padding and 1px inside the
                group's border, so 12px from the outer edge. A radius shares a
                centre with the circle inside it when it is the sum: 14 + 12 =
                26. The group's own rounded-lg was 10px — tighter than the
                circle it contains, which is what makes a corner look pinched.

                The inset ring is one border further in, at 25px, because
                inset-0 puts it against the padding box rather than the border
                box. */}
            {/* The staged files sit above the box rather than inside it: the
                composer grows as somebody types, and a row of chips inside a
                control that already has a ceiling would be competing with the
                words for the same bounded height. */}
            {staged.length > 0 ? (
              <div className="mb-1.5">
                <Attachments
                  files={staged}
                  onRemove={(file) =>
                    setStaged((current) => current.filter((held) => held.path !== file.path))
                  }
                />
              </div>
            ) : null}

            <InputGroup className="rounded-[26px] before:rounded-[25px] **:[textarea]:min-h-14! **:[textarea]:max-h-40! **:[textarea]:overflow-y-auto!">
              <InputGroupTextarea
                aria-label="Message"
                disabled={!workspaceId}
                placeholder="Ask something…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  // An input method is mid-word, and this Enter belongs to it.
                  //
                  // Typing Chinese, Japanese or Korean means typing a reading
                  // and then pressing Enter to choose among the candidates
                  // offered for it. That Enter arrives here as an ordinary
                  // keydown, indistinguishable from the one that means send —
                  // so without this, choosing a character sent the half-typed
                  // message it was part of. The composition has to be allowed
                  // to finish; the next Enter, once it has, is the real one.
                  //
                  // keyCode is deprecated and is checked anyway: it is 229
                  // while an IME is handling a key, and it is the only signal
                  // some browsers give on the keydown that ends a composition,
                  // where isComposing has already gone false.
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return;

                  // Enter sends, Shift+Enter breaks the line. The other way
                  // round is defensible, but every other chat works this way
                  // and muscle memory is not something to be clever with.
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              {/* After the textarea in the DOM, which the input group
                  requires: the addon is what click-to-focus reaches past. */}
              <InputGroupAddon align="block-end">
                {/* The slot on the left, which finally has something to do.
                  Absent rather than disabled where there is no desktop bridge
                  to open a dialog with: a web page cannot learn a file's path,
                  and a path is the whole of what gets stored — so in a browser
                  the feature does not exist rather than existing and failing. */}
                {window.dao?.chooseAttachments ? (
                  <Button
                    aria-label="Attach files"
                    className="rounded-full"
                    disabled={sending || !workspaceId}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    onClick={chooseAttachments}
                  >
                    <IconPaperclip aria-hidden="true" />
                  </Button>
                ) : null}

                {/* The same corner, so the button that started the reply is the
                  button that ends it — and type="button" while it stops, or
                  pressing it would submit the form it sits in. It is never
                  disabled: the moment a reply is worth stopping is exactly the
                  moment it is running. */}
                {sending ? (
                  <Button
                    aria-label="Stop"
                    className="ms-auto rounded-full"
                    size="icon-sm"
                    type="button"
                    variant="outline"
                    onClick={stop}
                  >
                    <IconPlayerStop aria-hidden="true" />
                  </Button>
                ) : (
                  <Button
                    aria-label="Send"
                    className="ms-auto rounded-full"
                    disabled={(!draft.trim() && staged.length === 0) || !workspaceId}
                    size="icon-sm"
                    type="submit"
                  >
                    <IconArrowUp aria-hidden="true" />
                  </Button>
                )}
              </InputGroupAddon>
            </InputGroup>
          </div>
        </form>
      </div>
    </section>
  );
}
