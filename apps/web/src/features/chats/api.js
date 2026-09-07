import { apiFetch } from '@/lib/api-client.js';
import { readEvents } from '@/lib/sse.js';
import {
  ConversationDetailSchema,
  ConversationSchema,
  DeltaEventSchema,
  DoneEventSchema,
  ProposalEventSchema,
  AttachmentSchema,
  ReasoningEventSchema,
  StartEventSchema,
  ToolEventSchema,
} from './schemas.js';

export async function listConversations(workspaceId) {
  const response = await apiFetch(`/api/chats?workspaceId=${encodeURIComponent(workspaceId)}`);

  if (!response.ok) {
    throw new Error(`Failed to read conversations: ${response.status}`);
  }

  return ConversationSchema.array().parse(await response.json());
}

export async function createConversation(workspaceId) {
  const response = await apiFetch('/api/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to start a conversation: ${response.status}`);
  }

  return ConversationSchema.parse(await response.json());
}

export async function getConversation(conversationId) {
  const response = await apiFetch(`/api/chats/${encodeURIComponent(conversationId)}`);

  if (!response.ok) {
    throw new Error(`Failed to read the conversation: ${response.status}`);
  }

  return ConversationDetailSchema.parse(await response.json());
}

export async function renameConversation(conversationId, title) {
  const response = await apiFetch(`/api/chats/${encodeURIComponent(conversationId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to rename the conversation: ${response.status}`);
  }

  return ConversationSchema.parse(await response.json());
}

export async function deleteConversation(conversationId) {
  const response = await apiFetch(`/api/chats/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete the conversation: ${response.status}`);
  }
}

/**
 * The ways a turn can fail before the model is even asked, each needing a
 * different thing from the reader.
 *
 * Deliberately not shared with the summary's list. They overlap but are not the
 * same — a day with nothing in it has no meaning here — and an enum shared
 * between two surfaces grows members that only one of them can act on.
 */
export const CHAT_OUTCOMES = {
  notConfigured: 'notConfigured',
  keyRejected: 'keyRejected',
  rateLimited: 'rateLimited',
  missing: 'missing',

  // A change that was already answered — by another window, or by the same
  // person pressing twice. Its own outcome because there is nothing to fix and
  // nothing to retry: the decision was made, and the conversation just has to
  // be read again to see what it was.
  answered: 'answered',

  failed: 'failed',
};

export class ChatError extends Error {
  constructor(outcome, message) {
    super(message);
    this.name = 'ChatError';
    this.outcome = outcome;
  }
}

function outcomeFor(status) {
  switch (status) {
    case 428:
      return CHAT_OUTCOMES.notConfigured;
    case 401:
    case 403:
      return CHAT_OUTCOMES.keyRejected;
    case 429:
      return CHAT_OUTCOMES.rateLimited;
    case 404:
      return CHAT_OUTCOMES.missing;
    case 409:
      return CHAT_OUTCOMES.answered;
    default:
      return CHAT_OUTCOMES.failed;
  }
}

/**
 * Read one turn's stream to its end.
 *
 * Shared by the two ways a turn starts — somebody said something, or somebody
 * answered a change the model prepared. What comes back is identical: the same
 * events in the same order, ending on the same stored row. A second copy of
 * this walk would be a second set of decisions about what a missing done means.
 */
async function readTurn(response, { onStart, onDelta, onReasoning, onTool, onProposal } = {}) {
  // Everything the service can refuse, it refuses before the first event, so a
  // failure here is still an ordinary response with a status worth reading.
  if (!response.ok) {
    const message = (await response.text()) || `Request failed: ${response.status}`;
    throw new ChatError(outcomeFor(response.status), message);
  }

  let done = null;

  for await (const event of readEvents(response)) {
    switch (event.name) {
      case 'start':
        onStart?.(StartEventSchema.parse(event.data));
        break;
      case 'delta':
        onDelta?.(DeltaEventSchema.parse(event.data).text);
        break;
      case 'reasoning':
        onReasoning?.(ReasoningEventSchema.parse(event.data).text);
        break;
      case 'tool':
        onTool?.(ToolEventSchema.parse(event.data));
        break;
      case 'proposal':
        onProposal?.(ProposalEventSchema.parse(event.data));
        break;
      case 'done':
        done = DoneEventSchema.parse(event.data);
        break;
      default:
        // An event this build does not know is skipped rather than treated as a
        // failure: a newer service adding one should not break an older window.
        break;
    }
  }

  // Every stream that opens ends with done. Reaching here without one means the
  // connection died mid-answer, which is not the same as a reply that failed —
  // the service may well have recorded one — so the caller is told to go and
  // look rather than being handed a turn that was never delivered.
  if (!done) {
    throw new ChatError(CHAT_OUTCOMES.failed, 'The connection closed before the reply finished');
  }

  return done;
}

/**
 * Send a turn and read the reply as it is written.
 *
 * A plain fetch rather than EventSource: this is a POST with a body, and
 * EventSource can only issue a GET. What it gives up — reconnection — is not
 * wanted anyway, since a reconnect would ask the model the same question a
 * second time and be billed for it.
 *
 * The callbacks report progress; the promise resolves with the assistant row
 * the stream ended on, which is the one the transcript now holds.
 */
export async function sendMessage(
  conversationId,
  content,
  { attachments = [], signal, ...callbacks } = {},
) {
  const response = await apiFetch(`/api/chats/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Attachments go as the paths they were chosen at, not as bytes. The
    // service reads the files itself, off the same disk, and posting their
    // contents here would be a copy made to reach a process that can already
    // see them.
    body: JSON.stringify({ content, attachments }),
    signal,
  });

  return readTurn(response, callbacks);
}

/**
 * Ask the model again for a turn that failed.
 *
 * Into the same row, so the transcript ends up holding what was asked and what
 * eventually came back rather than a log of the provider's bad afternoon. The
 * stream is the same one a message opens, ending on the same done event
 * carrying the same row — which is why the reply lands where the failure was
 * without this side arranging anything.
 */
export async function retryMessage(conversationId, messageId, { signal, ...callbacks } = {}) {
  const response = await apiFetch(
    `/api/chats/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/retry`,
    { method: 'POST', signal },
  );

  return readTurn(response, callbacks);
}

/**
 * What some paths would be attached as.
 *
 * Asked as soon as files are chosen, so a file too large or of a kind that
 * cannot be sent is refused while the dialog is still what somebody is
 * thinking about — rather than after they have written a message to go with
 * it. The service answers, because the service owns the rule; a copy of the
 * limit here would be a second limit to keep in step.
 */
export async function describeAttachments(paths) {
  const response = await apiFetch('/api/chats/attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  });

  if (!response.ok) {
    const message = (await response.text()) || 'Those files could not be attached';
    throw new ChatError(outcomeFor(response.status), message);
  }

  return AttachmentSchema.array().parse(await response.json());
}

/** The two things somebody can say about a change the model prepared. */
export const DECISIONS = {
  apply: 'apply',
  discard: 'discard',
};

/**
 * Answer a proposed change, and carry the conversation on.
 *
 * The decision is the whole of the request. What gets written is read by the
 * service from the row that was shown, so there is nothing here to substitute —
 * a confirmation that carried its own payload would be confirming whatever this
 * call last said rather than what the person read.
 *
 * It streams, and for the same reason sending a message does: what happens next
 * is the model being asked again. There is no user message in the start event,
 * because nobody said anything.
 */
export async function resolveProposal(
  conversationId,
  proposalId,
  decision,
  { signal, ...callbacks } = {},
) {
  const response = await apiFetch(
    `/api/chats/${encodeURIComponent(conversationId)}/proposals/${encodeURIComponent(proposalId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
      signal,
    },
  );

  return readTurn(response, callbacks);
}
