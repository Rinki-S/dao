import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarProvider } from '@/components/ui/sidebar.jsx';
import { ChatHistory } from './ChatHistory.jsx';
import { ChatsWorkspace } from './ChatsWorkspace.jsx';
import { ConversationsProvider } from './ConversationsProvider.jsx';
import { CHAT_OUTCOMES, ChatError } from '../api.js';

// The error class and the outcome names stay real: they are the contract
// between the transport and this surface, and a stubbed copy would let the two
// drift apart without a test noticing.
const api = vi.hoisted(() => ({
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  getConversation: vi.fn(),
  listConversations: vi.fn(),
  renameConversation: vi.fn(),
  resolveProposal: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('../api.js', async (importOriginal) => ({ ...(await importOriginal()), ...api }));

afterEach(() => vi.clearAllMocks());

const model = {
  currentWorkspace: { id: 'workspace-1' },
  // What a search hit asked to open, and the way to say it has been opened.
  revealedChatId: '',
  setRevealedChatId: vi.fn(),
};

beforeEach(() => {
  api.listConversations.mockResolvedValue([]);
  api.createConversation.mockResolvedValue({ id: 'chat-1' });
});

function message(overrides = {}) {
  return {
    id: 'message-1',
    conversationId: 'chat-1',
    role: 'user',
    content: 'hi',
    position: 0,
    model: '',
    wire: '',
    inputTokens: 0,
    outputTokens: 0,
    status: 'ok',
    errorMessage: '',
    createdAt: '2026-08-27T10:41:33Z',
    ...overrides,
  };
}

/** A send that streams the given pieces and ends on the given stored row. */
function replies(pieces, stored) {
  api.sendMessage.mockImplementation(async (_id, content, { onStart, onDelta }) => {
    onStart?.({ userMessage: message({ content }), assistantMessageId: 'message-2' });
    for (const piece of pieces) onDelta?.(piece);
    return stored;
  });
}

function assistant(overrides = {}) {
  return {
    ...message(),
    id: 'message-2',
    role: 'assistant',
    content: 'An answer.',
    position: 1,
    model: 'test-model',
    wire: 'openai',
    ...overrides,
  };
}

/**
 * The surface as it is actually assembled: the pane, and the sidebar section
 * that lists its conversations. They are separate components sharing one
 * provider, and half of what is worth testing lives in the seam between them —
 * New chat and Delete are pressed on one side and answered on the other.
 */
function renderChats(overrides = {}) {
  const current = { ...model, ...overrides };

  return render(
    <ConversationsProvider model={current}>
      <SidebarProvider>
        <ChatHistory />
        <ChatsWorkspace model={current} onOpenSettings={vi.fn()} />
      </SidebarProvider>
    </ConversationsProvider>,
  );
}

async function ask(text = 'a question') {
  renderChats();
  await userEvent.type(screen.getByLabelText('Message'), text);
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
}

describe('ChatsWorkspace', () => {
  it('shows the question and the reply it was given', async () => {
    replies(['An ', 'answer.'], assistant());

    await ask();

    expect(await screen.findByText('a question')).toBeInTheDocument();
    expect(await screen.findByText('An answer.')).toBeInTheDocument();
  });

  it('does not read the conversation back over the turn it is streaming', async () => {
    // The first turn of a new chat selects the conversation it just created,
    // and a load fired by that selection would land mid-answer and replace the
    // reply with the half-written row the service is still filling in.
    replies(['An ', 'answer.'], assistant());

    await ask();

    await screen.findByText('An answer.');
    expect(api.getConversation).not.toHaveBeenCalled();
  });

  it('creates the conversation only when there is something to put in it', async () => {
    renderChats();
    await userEvent.click(screen.getByRole('button', { name: 'New chat' }));

    // A conversation started by opening the pane would leave a row behind every
    // time someone thought better of asking.
    expect(api.createConversation).not.toHaveBeenCalled();
  });

  it('keeps a reply that stops mid-thought, and says that it does', async () => {
    replies(
      ['Half an answer'],
      assistant({
        content: 'Half an answer',
        status: 'failed',
        errorMessage: 'read stream: unexpected EOF',
      }),
    );

    await ask();

    expect(await screen.findByText('Half an answer')).toBeInTheDocument();
    expect(screen.getByText('This reply stops mid-thought')).toBeInTheDocument();
    expect(screen.getByText('read stream: unexpected EOF')).toBeInTheDocument();
  });

  it('points at Settings when no model is connected', async () => {
    api.sendMessage.mockRejectedValue(
      new ChatError(CHAT_OUTCOMES.notConfigured, 'no model provider is configured'),
    );

    await ask();

    expect(await screen.findByText('No model connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeInTheDocument();
  });

  it('hands the words back when the turn was refused', async () => {
    api.sendMessage.mockRejectedValue(
      new ChatError(CHAT_OUTCOMES.notConfigured, 'no model provider is configured'),
    );

    await ask('something worth keeping');

    // Nothing was sent. Clearing the box would make the reader retype a
    // question to fix a problem that is not theirs.
    await waitFor(() =>
      expect(screen.getByLabelText('Message')).toHaveValue('something worth keeping'),
    );
  });

  it('opens a conversation from the list', async () => {
    api.listConversations.mockResolvedValue([
      {
        id: 'chat-1',
        workspaceId: 'workspace-1',
        title: 'Yesterday',
        createdAt: '',
        updatedAt: '',
      },
    ]);
    api.getConversation.mockResolvedValue({
      proposals: [],
      id: 'chat-1',
      workspaceId: 'workspace-1',
      title: 'Yesterday',
      createdAt: '',
      updatedAt: '',
      messages: [message({ content: 'an older question' }), assistant()],
    });

    renderChats();
    await userEvent.click(await screen.findByRole('button', { name: 'Yesterday' }));

    expect(await screen.findByText('an older question')).toBeInTheDocument();
    expect(screen.getByText('An answer.')).toBeInTheDocument();
  });
});

describe('what the model looked up', () => {
  it('says what was searched for while it is happening', async () => {
    api.sendMessage.mockImplementation(async (_id, content, { onStart, onTool, onDelta }) => {
      onStart?.({ userMessage: message({ content }), assistantMessageId: 'message-2' });
      onTool?.({ name: 'search_notes', input: '{"query":"parser"}' });
      onDelta?.('You wrote about parsers.');
      return assistant({
        content: 'You wrote about parsers.',
        toolCalls: [{ name: 'search_notes', input: '{"query":"parser"}' }],
      });
    });

    await ask();

    // The query, not just "searched your notes": only the specific claim is one
    // the reader can check against what they know is in there.
    expect(await screen.findByText('Searched your notes for “parser”')).toBeInTheDocument();
  });

  it('still says so after a reload', async () => {
    // The question this app has to answer about itself is "did it read my
    // notes?", and an answer that only appeared while it was being written does
    // not answer it tomorrow.
    api.listConversations.mockResolvedValue([
      {
        id: 'chat-1',
        workspaceId: 'workspace-1',
        title: 'Yesterday',
        createdAt: '',
        updatedAt: '',
      },
    ]);
    api.getConversation.mockResolvedValue({
      proposals: [],
      id: 'chat-1',
      workspaceId: 'workspace-1',
      title: 'Yesterday',
      createdAt: '',
      updatedAt: '',
      messages: [
        message({ content: 'what did I write?' }),
        assistant({
          toolCalls: [
            { name: 'search_notes', input: '{"query":"parser"}' },
            { name: 'read_tasks', input: '{}' },
          ],
        }),
      ],
    });

    renderChats();
    await userEvent.click(await screen.findByRole('button', { name: 'Yesterday' }));

    expect(await screen.findByText('Searched your notes for “parser”')).toBeInTheDocument();
    expect(screen.getByText('Read your task list')).toBeInTheDocument();
  });

  it('names a tool it has never heard of rather than hiding it', async () => {
    // A newer service adding a tool should not make the model appear to have
    // done nothing.
    api.getConversation.mockResolvedValue({
      proposals: [],
      id: 'chat-1',
      workspaceId: 'workspace-1',
      title: 'Yesterday',
      createdAt: '',
      updatedAt: '',
      messages: [assistant({ toolCalls: [{ name: 'read_calendar', input: '{}' }] })],
    });
    api.listConversations.mockResolvedValue([
      {
        id: 'chat-1',
        workspaceId: 'workspace-1',
        title: 'Yesterday',
        createdAt: '',
        updatedAt: '',
      },
    ]);

    renderChats();
    await userEvent.click(await screen.findByRole('button', { name: 'Yesterday' }));

    expect(await screen.findByText('Ran read_calendar')).toBeInTheDocument();
  });

  it('survives arguments that are not JSON', async () => {
    // A model writes the arguments, so they arrive however it wrote them. The
    // tool refused these; the line still has to render.
    api.getConversation.mockResolvedValue({
      proposals: [],
      id: 'chat-1',
      workspaceId: 'workspace-1',
      title: 'Yesterday',
      createdAt: '',
      updatedAt: '',
      messages: [assistant({ toolCalls: [{ name: 'search_notes', input: '{"query":' }] })],
    });
    api.listConversations.mockResolvedValue([
      {
        id: 'chat-1',
        workspaceId: 'workspace-1',
        title: 'Yesterday',
        createdAt: '',
        updatedAt: '',
      },
    ]);

    renderChats();
    await userEvent.click(await screen.findByRole('button', { name: 'Yesterday' }));

    expect(await screen.findByText('Searched your notes')).toBeInTheDocument();
  });
});

describe('stopping a reply', () => {
  /** A send that streams a piece and then waits to be aborted. */
  function replyThatWaits() {
    api.sendMessage.mockImplementation(
      (_id, content, { onStart, onDelta, signal }) =>
        new Promise((_resolve, reject) => {
          onStart?.({ userMessage: message({ content }), assistantMessageId: 'message-2' });
          onDelta?.('Half an answer');
          signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
  }

  it('offers a stop while a reply is running, and a send when it is not', async () => {
    replyThatWaits();
    await ask();

    // The moment a reply is worth stopping is the moment it is running, so the
    // control is there and enabled.
    const stop = await screen.findByRole('button', { name: 'Stop' });
    expect(stop).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();

    await userEvent.click(stop);

    expect(await screen.findByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('keeps the words that arrived and says who ended it', async () => {
    replyThatWaits();
    await ask();

    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }));

    // What the reader watched arrive is what the turn holds.
    expect(await screen.findByText('Half an answer')).toBeInTheDocument();
    expect(screen.getByText('You stopped this reply')).toBeInTheDocument();
  });

  it('does not report stopping as a failure', async () => {
    replyThatWaits();
    await ask();

    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await screen.findByText('You stopped this reply');

    // Nothing went wrong, so none of the failure machinery fires: no alert, and
    // the composer is not handed the question back as though it were unsent.
    expect(screen.queryByText('The reply did not arrive')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Message')).toHaveValue('');
  });
});

// A hit in Search opens the conversation it found. Chats is not the surface
// that ran the search, so the id has to survive the move between them.
it('opens the conversation a search hit asked for', async () => {
  api.listConversations.mockResolvedValue([
    { id: 'chat-9', workspaceId: 'workspace-1', title: 'Found', createdAt: '', updatedAt: '' },
  ]);
  api.getConversation.mockResolvedValue({
    proposals: [],
    id: 'chat-9',
    workspaceId: 'workspace-1',
    title: 'Found',
    createdAt: '',
    updatedAt: '',
    messages: [message({ content: 'the question I searched for' })],
  });

  renderChats({ revealedChatId: 'chat-9' });

  // Opened without anybody clicking it.
  expect(await screen.findByText('the question I searched for')).toBeInTheDocument();
  expect(api.getConversation).toHaveBeenCalledWith('chat-9');
});

// The list is in the app's sidebar and the transcript is in the pane, so every
// one of these crosses between two components that only share a provider.
describe('the sidebar and the pane, on the same conversation', () => {
  const yesterday = {
    id: 'chat-1',
    workspaceId: 'workspace-1',
    title: 'Yesterday',
    createdAt: '',
    updatedAt: '',
  };

  beforeEach(() => {
    api.listConversations.mockResolvedValue([yesterday]);
    api.getConversation.mockResolvedValue({
      proposals: [],
      ...yesterday,
      messages: [message({ content: 'an older question' })],
    });
  });

  it('names the open conversation above the transcript', async () => {
    renderChats();
    await userEvent.click(await screen.findByRole('button', { name: 'Yesterday' }));

    // The row and the header are two views of one thing and must not disagree.
    expect(await screen.findByRole('heading', { name: 'Yesterday' })).toBeInTheDocument();
  });

  it('empties the pane when the sidebar starts a new chat', async () => {
    renderChats();
    await userEvent.click(await screen.findByRole('button', { name: 'Yesterday' }));
    await screen.findByText('an older question');

    await userEvent.click(screen.getByRole('button', { name: 'New chat' }));

    // Nothing in the pane can be reached from the button that did this, so a
    // transcript left behind would sit under a header that says New chat.
    await waitFor(() => expect(screen.queryByText('an older question')).toBeNull());
    expect(screen.getByRole('heading', { name: 'New chat' })).toBeInTheDocument();
  });

  it('empties the pane when the open conversation is deleted', async () => {
    api.deleteConversation.mockResolvedValue(undefined);

    renderChats();
    await userEvent.click(await screen.findByRole('button', { name: 'Yesterday' }));
    await screen.findByText('an older question');

    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: 'Yesterday' }),
    });
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete conversation' }));

    await waitFor(() => expect(api.deleteConversation).toHaveBeenCalledWith('chat-1'));
    await waitFor(() => expect(screen.queryByText('an older question')).toBeNull());
    // Gone from the list as well as from the pane.
    expect(screen.queryByRole('button', { name: 'Yesterday' })).toBeNull();
  });
});

// The point of the whole milestone: the model can ask to change a note, and
// nothing is written until somebody says so in the place they were asked.
describe('a change the model proposed', () => {
  const chat = {
    id: 'chat-1',
    workspaceId: 'workspace-1',
    title: 'Ports',
    createdAt: '',
    updatedAt: '',
  };

  function change(overrides = {}) {
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

  /** A turn that prepares a change and stops. */
  function proposes() {
    api.sendMessage.mockImplementation(
      async (_id, content, { onStart, onTool, onDelta, onProposal }) => {
        onStart?.({ userMessage: message({ content }), assistantMessageId: 'message-2' });
        onTool?.({ name: 'edit_note', input: '{"id":"note-1"}' });
        onDelta?.('Here is what I would change.');
        onProposal?.(change());

        return assistant({
          content: 'Here is what I would change.',
          toolCalls: [
            { id: 'call-1', name: 'edit_note', input: '{"id":"note-1"}', status: 'pending' },
          ],
        });
      },
    );
  }

  it('shows the change under the turn that asked for it', async () => {
    proposes();

    await ask('fix the port');

    expect(await screen.findByRole('heading', { name: 'Change to “Ports”' })).toBeInTheDocument();
    expect(screen.getByText('Listens on 8080.')).toBeInTheDocument();
    expect(screen.getByText('Listens on 7743.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('does not say the note was changed', async () => {
    // The tool prepared a change; it did not make one. A line claiming
    // otherwise would be the transcript's own claim, not the model's.
    proposes();

    await ask('fix the port');

    expect(await screen.findByText('Prepared a change to a note')).toBeInTheDocument();
  });

  it('sends the decision and carries the conversation on', async () => {
    proposes();
    api.resolveProposal.mockImplementation(async (_chat, _proposal, _decision, { onStart }) => {
      // Nobody said anything, so there is no user turn to add.
      onStart?.({ assistantMessageId: 'message-3' });

      return assistant({ id: 'message-3', content: 'The note now says 7743.', position: 2 });
    });

    await ask('fix the port');
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }));

    expect(api.resolveProposal).toHaveBeenCalledWith(
      'chat-1',
      'proposal-1',
      'apply',
      expect.anything(),
    );
    expect(await screen.findByText('The note now says 7743.')).toBeInTheDocument();
  });

  it('says what was decided once it has been', async () => {
    proposes();
    api.resolveProposal.mockImplementation(
      async (_chat, _proposal, _decision, { onStart, onProposal }) => {
        onStart?.({ assistantMessageId: 'message-3' });
        // How the card finds out. The service resolves the row before it opens
        // the stream and sends what it wrote.
        onProposal?.(change({ status: 'discarded' }));

        return assistant({ id: 'message-3', content: 'Nothing was written.', position: 2 });
      },
    );

    await ask('fix the port');
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));

    expect(await screen.findByText('You discarded this change')).toBeInTheDocument();
    // The question is answered, so it stops being asked.
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('does not call an apply the note refused an apply', async () => {
    // The decision the person made and what came of acting on it are two
    // different things, and this pane only ever knows the first. Reading the
    // status off the decision it sent would show the change as made, over a
    // reply explaining that it was not.
    proposes();
    api.resolveProposal.mockImplementation(
      async (_chat, _proposal, _decision, { onStart, onProposal }) => {
        onStart?.({ assistantMessageId: 'message-3' });
        onProposal?.(change({ status: 'failed' }));

        return assistant({
          id: 'message-3',
          content: 'The note changed while you were reading.',
          position: 2,
        });
      },
    );

    await ask('fix the port');
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('This change could not be applied')).toBeInTheDocument();
    expect(screen.queryByText('You applied this change')).toBeNull();
  });

  it('leaves the change waiting when the decision was refused', async () => {
    // The service records the decision before it opens the stream, so a refusal
    // means nothing was recorded — and a card that had already moved on would
    // be reporting something that did not happen.
    proposes();
    api.resolveProposal.mockRejectedValue(
      new ChatError(CHAT_OUTCOMES.answered, 'that change was already answered'),
    );

    await ask('fix the port');
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('That change was already answered')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });

  it('is still waiting after a reload', async () => {
    // A decision nobody made should not be lost by closing the window, and one
    // somebody made should not be asked for twice.
    api.listConversations.mockResolvedValue([chat]);
    api.getConversation.mockResolvedValue({
      ...chat,
      messages: [
        message({ content: 'fix the port' }),
        assistant({
          content: 'Here is what I would change.',
          toolCalls: [
            { id: 'call-1', name: 'edit_note', input: '{"id":"note-1"}', status: 'pending' },
          ],
        }),
      ],
      proposals: [change()],
    });

    renderChats();
    await userEvent.click(await screen.findByRole('button', { name: 'Ports' }));

    expect(await screen.findByRole('heading', { name: 'Change to “Ports”' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });

  it('keeps an answered change in the transcript after a reload', async () => {
    api.listConversations.mockResolvedValue([chat]);
    api.getConversation.mockResolvedValue({
      ...chat,
      messages: [assistant({ toolCalls: [{ id: 'call-1', name: 'edit_note', input: '{}' }] })],
      proposals: [change({ status: 'applied' })],
    });

    renderChats();
    await userEvent.click(await screen.findByRole('button', { name: 'Ports' }));

    expect(await screen.findByText('You applied this change')).toBeInTheDocument();
  });

  it('sets the change aside when the reader says something else instead', async () => {
    // Not a convenience. A tool call left unanswered cannot be replayed, so the
    // service abandons it before storing the next message — and a pane still
    // offering the buttons would be offering a decision that is no longer open.
    proposes();

    await ask('fix the port');
    await screen.findByRole('button', { name: 'Apply' });

    // The service sets the change aside before it stores this turn, and sends
    // the row it set aside — which is the only way this pane could know.
    api.sendMessage.mockImplementation(async (_id, content, { onStart, onProposal }) => {
      onStart?.({ userMessage: message({ content }), assistantMessageId: 'message-3' });
      onProposal?.(change({ status: 'discarded' }));

      return assistant({ id: 'message-3', content: 'Something else entirely.', position: 2 });
    });

    await userEvent.type(screen.getByLabelText('Message'), 'never mind');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('You discarded this change')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });
});
