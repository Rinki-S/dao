import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiProviderSettings } from './AiProviderSettings.jsx';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client.js', () => ({ apiFetch }));
vi.mock('@/features/notes/note-save-queue.js', () => ({
  waitForAllPendingNoteSaves: vi.fn().mockResolvedValue(undefined),
}));

function settings(overrides = {}) {
  return {
    wire: 'openai',
    baseUrl: 'https://api.example.com',
    model: 'some-model',
    keyPresent: false,
    configured: false,
    ...overrides,
  };
}

function jsonResponse(body) {
  return { ok: true, json: async () => body, text: async () => JSON.stringify(body) };
}

let bridge;

beforeEach(() => {
  bridge = {
    getModelKeyStatus: vi.fn().mockResolvedValue({ available: true, present: false }),
    setModelApiKey: vi.fn().mockResolvedValue({ ok: true, error: '' }),
    clearModelApiKey: vi.fn().mockResolvedValue({ ok: true, error: '' }),
  };
  window.dao = bridge;
  apiFetch.mockResolvedValue(jsonResponse(settings()));
});

afterEach(() => {
  delete window.dao;
  vi.clearAllMocks();
});

async function open() {
  render(<AiProviderSettings />);
  return screen.findByLabelText('Base URL');
}

describe('AiProviderSettings', () => {
  it('shows what leaves the device before anything is enabled', async () => {
    await open();

    // A local-first app that starts sending a workspace to a third party owes
    // the reader a plain list, and it must be there before they type a key.
    expect(screen.getByText('What leaves this device')).toBeInTheDocument();
    expect(screen.getByText(/text of the notes and tasks/i)).toBeInTheDocument();
  });

  it('sends the settings to the service and the key to the bridge', async () => {
    await open();

    await userEvent.clear(screen.getByLabelText('Model'));
    await userEvent.type(screen.getByLabelText('Model'), 'claude-sonnet-4-5');
    await userEvent.type(screen.getByLabelText('API key'), 'sk-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(bridge.setModelApiKey).toHaveBeenCalledWith('sk-secret');
    });

    const put = apiFetch.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(put[1].body)).toEqual({
      wire: 'openai',
      baseUrl: 'https://api.example.com',
      model: 'claude-sonnet-4-5',
    });

    // The key must not have gone over HTTP alongside the settings.
    expect(put[1].body).not.toContain('sk-secret');
  });

  it('clears the key field after saving, and never shows a stored key', async () => {
    bridge.getModelKeyStatus.mockResolvedValue({ available: true, present: true });
    apiFetch.mockResolvedValue(jsonResponse(settings({ keyPresent: true, configured: true })));

    await open();

    const keyField = screen.getByLabelText('API key');
    // There is nothing to display: the bridge has no getter.
    expect(keyField).toHaveValue('');
    expect(keyField).toHaveAttribute('placeholder', expect.stringMatching(/type to replace/i));

    await userEvent.type(keyField, 'sk-new');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(keyField).toHaveValue(''));
  });

  it('reports a refused key instead of claiming it saved', async () => {
    bridge.setModelApiKey.mockResolvedValue({ ok: false, error: 'Keychain unavailable' });

    await open();
    await userEvent.type(screen.getByLabelText('API key'), 'sk-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Keychain unavailable');
  });

  it('surfaces what the service refused', async () => {
    apiFetch.mockImplementation(async (_path, init) => {
      if (init?.method === 'PUT') {
        return { ok: false, status: 400, text: async () => 'base URL must be an http(s) URL' };
      }
      return jsonResponse(settings());
    });

    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('http(s) URL');
  });

  it('offers to forget a stored key, and only then', async () => {
    await open();
    expect(screen.queryByRole('button', { name: 'Forget key' })).not.toBeInTheDocument();

    bridge.getModelKeyStatus.mockResolvedValue({ available: true, present: true });
    render(<AiProviderSettings />);

    const forget = await screen.findByRole('button', { name: 'Forget key' });
    await userEvent.click(forget);

    await waitFor(() => expect(bridge.clearModelApiKey).toHaveBeenCalled());
  });

  it('says so when the system cannot store a secret at all', async () => {
    bridge.getModelKeyStatus.mockResolvedValue({ available: false, present: false });

    await open();

    expect(screen.getByText(/cannot store secrets securely/i)).toBeInTheDocument();
  });
});
