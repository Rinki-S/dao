import { z } from 'zod';

// The two roles a stored turn can have. There is no system role: the prompt
// belongs to the build that sent it, not to the transcript, so the renderer
// never sees one and has nothing to render for it.
export const MESSAGE_ROLES = ['user', 'assistant'];

// What became of an assistant turn.
//
// Failed does not mean empty — a stream that died half way left real text
// behind, and the surface has to show that text while being honest that it
// stops mid-thought. Stopped is not a kind of failure at all: the reader ended
// it, and what had arrived is kept the way a finished turn's words are.
export const MESSAGE_STATUSES = ['ok', 'failed', 'stopped'];

// The fields the service leaves out when they are empty are given defaults
// rather than made optional. A component reading message.model should get a
// string either way; `undefined` would be a second empty case to write a branch
// for at every use.
// One thing the model looked up before answering.
//
// The arguments come as the string the model wrote, not as an object: the
// service stores what was actually sent, and a model can write arguments that
// are not valid JSON. Whatever reads them has to cope with that rather than
// having it parsed away here.
export const ToolCallSchema = z.object({
  name: z.string(),
  input: z.string().default(''),

  // What the model was told, and whether the call is finished.
  //
  // None of this is shown: the line announcing the call is what a reader wants,
  // and nobody wants to look at a call's id. It is here because the service
  // keeps it — the transcript is what gets read back to the model on the next
  // turn — and because `pending` is how a call says it is waiting on a person
  // rather than still running, which is a thing this surface will have to show.
  id: z.string().default(''),
  output: z.string().default(''),
  status: z.string().default(''),

  // How much of the reply had been written when this ran, as a UTF-16 offset
  // — which is what a JavaScript string index is, so it can cut the text
  // directly. Zero on every call stored before the service recorded this,
  // which puts them all at the front, exactly where they used to be drawn.
  at: z.number().default(0),
});

// A file attached to a turn.
//
// Size and modifiedAt are what the file measured when it was attached. They
// are not shown; they exist because attachments are not copied, so on a later
// turn the service re-reads the path and these are what tell "the file that
// was sent" from "whatever is there now".
export const AttachmentSchema = z.object({
  path: z.string(),
  filename: z.string(),
  mediaType: z.string().default(''),
  size: z.number().default(0),
  modifiedAt: z.string().default(''),

  // Whether the file can still be read as the one that was sent. Derived by
  // the service on the way out, never stored: it is a fact about the disk now
  // rather than about the turn.
  unreadable: z.boolean().default(false),
});

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(MESSAGE_ROLES),
  content: z.string(),
  position: z.number(),
  model: z.string().default(''),
  wire: z.string().default(''),
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  status: z.enum(MESSAGE_STATUSES),
  errorMessage: z.string().default(''),
  createdAt: z.string(),
  // What the model did before it answered, in order. Absent on a turn that
  // looked nothing up, and on every turn stored before this existed.
  toolCalls: z.array(ToolCallSchema).default([]),

  // What was attached to this turn. Paths and the numbers that say whether
  // the file is still the one that was sent — never the bytes: nothing is
  // copied, and the renderer has no use for the contents it does not display.
  attachments: z.array(AttachmentSchema).default([]),

  // A reasoning model's working. Absent from every other model's turns, and
  // from every turn stored before this existed, which is what the default is
  // for: a conversation from last week is not a conversation with a missing
  // field, it is one where nothing was thinking out loud.
  reasoning: z.string().default(''),
});

export const ConversationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// What became of a change the model prepared.
//
// Pending is the only one that is still a question. The other two are history:
// a transcript shows what happened, and a change somebody applied last week is
// as much a part of that as one they have not answered yet.
export const PROPOSAL_STATUSES = ['pending', 'applied', 'discarded'];

// What a proposal is proposing, which is also what it can be drawn as. There is
// no diff for a note being created and no content to compare for one being
// renamed, so the kind is what decides which of those a card shows.
export const PROPOSAL_KINDS = [
  'edit_note',
  'create_note',
  'edit_tasks',
  'rename_note',
  'delete_note',
];

// One line of the comparison, and what became of it.
//
// Computed by the service, not here. The change that gets written is the row's
// `after`, and a picture assembled from a second implementation on this side
// could differ from it without anything noticing — which is exactly the gap a
// confirmation is supposed to close.
export const DiffLineSchema = z.object({
  op: z.enum(['keep', 'add', 'remove']),
  text: z.string().default(''),
});

// A change the model worked out and did not make.
//
// `before` and `after` come with it even though the card draws `diff`: they are
// what the change *is*, and something that only held a rendering of them could
// not answer "what would this file say afterwards?".
export const ProposalSchema = z.object({
  id: z.string(),
  conversationId: z.string(),

  // The join to the transcript. Not a message id: the proposal is recorded
  // while the tool runs, before the turn it belongs to has been stored.
  toolCallId: z.string(),

  // Not an enum. A newer service proposing a kind this build has never heard of
  // should still get a card that says a change is waiting, rather than a
  // conversation that fails to render.
  kind: z.string(),
  targetId: z.string().default(''),
  title: z.string().default(''),
  before: z.string().default(''),
  after: z.string().default(''),
  diff: z.array(DiffLineSchema).default([]),
  status: z.string(),
  createdAt: z.string(),
});

export const ConversationDetailSchema = ConversationSchema.extend({
  messages: z.array(MessageSchema),

  // Nullish rather than defaulted: a build with no proposals wired up sends
  // `null` for this, and JSON's empty list and Go's nil slice are the same
  // thing said two ways.
  proposals: z
    .array(ProposalSchema)
    .nullish()
    .transform((value) => value ?? []),
});

// The events one turn's stream can carry. Validated like any other
// response: a stream is not more trustworthy than a body for arriving in a
// shape this build did not expect.
// Optional, because a turn that carries on after somebody answered a proposed
// change begins with nobody having said anything. The assistant's id is always
// there: it is where the deltas that follow have to go.
export const StartEventSchema = z.object({
  userMessage: MessageSchema.optional(),
  assistantMessageId: z.string(),
});

export const DeltaEventSchema = z.object({
  text: z.string(),
});

// One piece of a reasoning model's working, on its own event so that it can
// never be mistaken for a piece of the answer. It arrives whether or not this
// window is set to show it: what a person has chosen to look at is decided
// here, not by the service on everybody's behalf.
export const ReasoningEventSchema = z.object({
  text: z.string(),
});

// Sent when a tool starts, so the pause can be filled with what is causing it.
// It carries no phrasing: how to say "searched your notes for parser" is this
// side's business, where the rest of the product's words live.
//
// Its own shape rather than the stored call's, which it used to share. A call
// that is starting has no result and no outcome yet, and the two only looked
// alike while neither of them was kept.
export const ToolEventSchema = z.object({
  name: z.string(),
  input: z.string().default(''),
  at: z.number().default(0),
});

// Sent before done when a turn stopped to ask somebody something.
//
// The proposal exactly as it is stored, so what the card draws is the row that
// would be applied. It arrives on the stream only to save the client a second
// request — a reload gets the same thing from the conversation.
export const ProposalEventSchema = ProposalSchema;

// The stream's terminal event carries the assistant row exactly as stored, so
// what the screen shows after it is what a reload would show.
export const DoneEventSchema = MessageSchema;
