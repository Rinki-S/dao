import { afterEach, describe, expect, it, vi } from 'vitest';

import { CHAT_OUTCOMES, resolveProposal, sendMessage } from './api.js';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client.js', () => ({ apiFetch }));

afterEach(() => vi.clearAllMocks());

function message(overrides = {}) {
  return {
    id: 'message-2',
    conversationId: 'chat-1',
    role: 'assistant',
    content: 'Hello, this arrived in pieces.',
    position: 1,
    model: 'test-model',
    wire: 'openai',
    status: 'ok',
    createdAt: '2026-08-27T10:41:33Z',
    ...overrides,
  };
}

function frame(name, data) {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * A response whose body arrives in the given chunks.
 *
 * The chunks are the point of most of the tests below: an event boundary and a
 * character boundary both fall wherever the network decides, and neither is
 * something the reader is allowed to depend on.
 */
function streamOf(chunks) {
  // A chunk may be given as text, or as bytes when the test needs to cut one
  // somewhere text cannot be cut.
  const encoded = chunks.map((chunk) =>
    typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk,
  );

  apiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of encoded) controller.enqueue(chunk);
        controller.close();
      },
    }),
  });
}

/** Bytes, so a chunk can be cut in the middle of a character. */
function bytesOf(text) {
  return new TextEncoder().encode(text);
}

describe('sendMessage', () => {
  it('reports the turn as it arrives and resolves with the stored row', async () => {
    streamOf([
      frame('start', {
        userMessage: message({ id: 'message-1', role: 'user', content: 'hi', position: 0 }),
        assistantMessageId: 'message-2',
      }),
      frame('delta', { text: 'Hello, ' }),
      frame('delta', { text: 'this arrived in pieces.' }),
      frame('done', message()),
    ]);

    const deltas = [];
    const onStart = vi.fn();

    const stored = await sendMessage('chat-1', 'hi', {
      onStart,
      onDelta: (text) => deltas.push(text),
    });

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ assistantMessageId: 'message-2' }),
    );
    expect(deltas.join('')).toBe('Hello, this arrived in pieces.');
    expect(stored).toMatchObject({ id: 'message-2', status: 'ok' });
  });

  it('reads events that do not arrive whole', async () => {
    // One event split across three chunks, and two events in one chunk. Both
    // are ordinary things for a network to do.
    const done = frame('done', message());

    streamOf([
      `event: delta\nda`,
      `ta: {"text":"Hel`,
      `lo"}\n\n${frame('delta', { text: ' there' })}${done}`,
    ]);

    const deltas = [];
    const stored = await sendMessage('chat-1', 'hi', { onDelta: (text) => deltas.push(text) });

    expect(deltas.join('')).toBe('Hello there');
    expect(stored.id).toBe('message-2');
  });

  it('reassembles a character split across two chunks', async () => {
    // Not an edge case for a transcript in Chinese — it is most of them. A
    // decoder run per chunk would turn the split character into a replacement
    // mark, permanently.
    const text = frame('delta', { text: '你好' });
    const bytes = bytesOf(text);
    const cut = bytes.indexOf(bytesOf('你')[0]) + 1;

    streamOf([
      bytes.slice(0, cut),
      bytes.slice(cut),
      bytesOf(frame('done', message({ content: '你好' }))),
    ]);

    const deltas = [];
    const stored = await sendMessage('chat-1', 'hi', { onDelta: (text) => deltas.push(text) });

    expect(deltas.join('')).toBe('你好');
    expect(stored.content).toBe('你好');
  });

  it('skips an event it does not know', async () => {
    // A newer service adding an event should not break an older window.
    streamOf([frame('thinking', { text: 'hmm' }), frame('done', message())]);

    const stored = await sendMessage('chat-1', 'hi');

    expect(stored.id).toBe('message-2');
  });

  it('reports a refusal by what the reader can do about it', async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      status: 428,
      text: async () => 'no model provider is configured',
    });

    await expect(sendMessage('chat-1', 'hi')).rejects.toMatchObject({
      outcome: CHAT_OUTCOMES.notConfigured,
    });
  });

  it('does not report a reply it never received in full', async () => {
    // The service ends every stream it opens with done. Without one the
    // connection died mid-answer, and the row on the other side may say
    // something this window cannot know — so it reports the break rather than
    // presenting the pieces it happens to hold as the finished turn.
    streamOf([frame('delta', { text: 'half an ans' })]);

    await expect(sendMessage('chat-1', 'hi')).rejects.toThrow(/closed before the reply finished/);
  });

  it('reports a failed turn as a result, not as an error', async () => {
    // A turn that failed still happened, and the row that came back is the one
    // the transcript now holds. Throwing here would leave the caller unable to
    // show text the service has already kept.
    streamOf([
      frame('delta', { text: 'Half an answer' }),
      frame(
        'done',
        message({
          content: 'Half an answer',
          status: 'failed',
          errorMessage: 'read stream: unexpected EOF',
        }),
      ),
    ]);

    const stored = await sendMessage('chat-1', 'hi');

    expect(stored).toMatchObject({ status: 'failed', content: 'Half an answer' });
  });
});

function proposal(overrides = {}) {
  return {
    id: 'proposal-1',
    conversationId: 'chat-1',
    toolCallId: 'call-1',
    kind: 'edit_note',
    targetId: 'note-1',
    title: 'Ports',
    before: 'Listens on 8080.',
    after: 'Listens on 7743.',
    diff: [
      { op: 'remove', text: 'Listens on 8080.' },
      { op: 'add', text: 'Listens on 7743.' },
    ],
    status: 'pending',
    createdAt: '2026-09-02T10:00:00Z',
    ...overrides,
  };
}

describe('a turn that stops to ask', () => {
  it('hands over the change before the turn it belongs to', async () => {
    // The order is the point: by the time the caller holds the finished turn it
    // already holds the change that turn is waiting on, so there is never a
    // render with a stopped conversation and nothing to answer.
    streamOf([
      frame('delta', { text: 'I can change that.' }),
      frame('proposal', proposal()),
      frame('done', message({ content: 'I can change that.' })),
    ]);

    const seen = [];

    await sendMessage('chat-1', 'fix the port', {
      onProposal: (change) => seen.push(change),
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      id: 'proposal-1',
      toolCallId: 'call-1',
      diff: [
        { op: 'remove', text: 'Listens on 8080.' },
        { op: 'add', text: 'Listens on 7743.' },
      ],
    });
  });
});

describe('resolveProposal', () => {
  it('sends the decision and nothing else, and reads the turn that follows', async () => {
    // What gets written is read by the service from the row that was shown. A
    // confirmation carrying its own payload would be confirming whatever this
    // call last said rather than what the person read.
    streamOf([
      frame('start', { assistantMessageId: 'message-3' }),
      frame('delta', { text: 'Done.' }),
      frame('done', message({ id: 'message-3', content: 'Done.' })),
    ]);

    const onStart = vi.fn();
    const stored = await resolveProposal('chat-1', 'proposal-1', 'apply', { onStart });

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/chats/chat-1/proposals/proposal-1',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'apply' }) }),
    );
    // Nobody said anything, so the start event carries no user turn.
    expect(onStart).toHaveBeenCalledWith({ assistantMessageId: 'message-3' });
    expect(stored).toMatchObject({ id: 'message-3', content: 'Done.' });
  });

  it('reports a change somebody already answered as its own outcome', async () => {
    // There is nothing to fix and nothing to retry: the decision was made, and
    // the conversation only has to be read again to see what it was.
    apiFetch.mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => 'that change was already answered',
    });

    await expect(resolveProposal('chat-1', 'proposal-1', 'apply')).rejects.toMatchObject({
      outcome: CHAT_OUTCOMES.answered,
    });
  });
});
