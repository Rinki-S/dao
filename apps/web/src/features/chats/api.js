import { apiFetch } from '@/lib/api-client.js';
import { readEvents } from '@/lib/sse.js';
import {
  ConversationDetailSchema,
  ConversationSchema,
  DeltaEventSchema,
  DoneEventSchema,
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
    default:
      return CHAT_OUTCOMES.failed;
  }
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
  { onStart, onDelta, onTool, signal } = {},
) {
  const response = await apiFetch(`/api/chats/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    signal,
  });

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
      case 'tool':
        onTool?.(ToolEventSchema.parse(event.data));
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
