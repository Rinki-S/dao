import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatsWorkspace } from './ChatsWorkspace.jsx';
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

const model = { currentWorkspace: { id: 'workspace-1' } };

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

async function ask(text = 'a question') {
  render(<ChatsWorkspace model={model} onOpenSettings={vi.fn()} />);
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
    render(<ChatsWorkspace model={model} onOpenSettings={vi.fn()} />);
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

    render(<ChatsWorkspace model={model} onOpenSettings={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Yesterday' }));

    expect(await screen.findByText('an older question')).toBeInTheDocument();
    expect(screen.getByText('An answer.')).toBeInTheDocument();
  });
});
