import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsDialog } from './SettingsDialog.jsx';

// The AI tab hosts the provider panel, which reaches for the service and the
// desktop bridge the moment it mounts. Neither is what these tests are about.
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client.js', () => ({ apiFetch }));
vi.mock('@/features/notes/note-save-queue.js', () => ({
  waitForAllPendingNoteSaves: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  window.dao = {
    getModelKeyStatus: vi.fn().mockResolvedValue({ available: true, present: false }),
  };
  apiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      wire: 'openai',
      baseUrl: 'https://api.example.com',
      model: 'some-model',
      keyPresent: false,
      configured: false,
    }),
  });
});

afterEach(() => vi.clearAllMocks());

const model = {
  currentWorkspace: { id: 'workspace-1', name: 'Work' },
  workingDirectory: { path: '/tmp/dao' },
};

function renderSettings(overrides = {}) {
  const props = {
    appearance: 'system',
    model,
    open: true,
    showThinking: false,
    onAppearanceChange: vi.fn(),
    onOpenChange: vi.fn(),
    onReplayOnboarding: vi.fn(),
    onShowThinkingChange: vi.fn(),
    ...overrides,
  };

  render(<SettingsDialog {...props} />);

  return props;
}

describe('SettingsDialog', () => {
  it("offers the model's thinking as a switch, and reports turning it on", async () => {
    const props = renderSettings();

    await userEvent.click(screen.getByRole('tab', { name: 'AI' }));

    const control = await screen.findByRole('switch', { name: "Show the model's thinking" });
    expect(control).not.toBeChecked();

    await userEvent.click(control);

    // The first argument only. Base UI hands the callback the new state and an
    // event-details object after it, so anything downstream has to read the
    // state rather than assume it was called with one thing.
    expect(props.onShowThinkingChange).toHaveBeenCalledTimes(1);
    expect(props.onShowThinkingChange.mock.calls[0][0]).toBe(true);
  });

  it('shows the switch as on when the preference is on', async () => {
    renderSettings({ showThinking: true });

    await userEvent.click(screen.getByRole('tab', { name: 'AI' }));

    // Read from the preference rather than from the control's own state: a
    // switch that only tracked its own clicks would come back off every time
    // the dialog was reopened.
    expect(await screen.findByRole('switch', { name: "Show the model's thinking" })).toBeChecked();
  });
});
