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
});

export const ConversationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ConversationDetailSchema = ConversationSchema.extend({
  messages: z.array(MessageSchema),
});

// The three events one turn's stream can carry. Validated like any other
// response: a stream is not more trustworthy than a body for arriving in a
// shape this build did not expect.
export const StartEventSchema = z.object({
  userMessage: MessageSchema,
  assistantMessageId: z.string(),
});

export const DeltaEventSchema = z.object({
  text: z.string(),
});

// Sent when a tool starts, so the pause can be filled with what is causing it.
// It carries no phrasing: how to say "searched your notes for parser" is this
// side's business, where the rest of the product's words live.
export const ToolEventSchema = ToolCallSchema;

// The stream's terminal event carries the assistant row exactly as stored, so
// what the screen shows after it is what a reload would show.
export const DoneEventSchema = MessageSchema;
