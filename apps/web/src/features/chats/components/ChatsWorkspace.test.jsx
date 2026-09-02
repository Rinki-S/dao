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
