import fs from 'node:fs';
import path from 'node:path';

import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForAllPendingNoteSaves } from '@/features/notes/note-save-queue.js';
import { SettingsPanel } from './SettingsPanel.jsx';

vi.mock('@/features/notes/note-save-queue.js', () => ({
  waitForAllPendingNoteSaves: vi.fn(),
}));

const settingsPanelPath = path.resolve(import.meta.dirname, 'SettingsPanel.jsx');

describe('SettingsPanel shadcn Base UI boundary', () => {
  beforeEach(() => {
    waitForAllPendingNoteSaves.mockResolvedValue();
    Object.defineProperty(window, 'dao', {
      configurable: true,
      value: {
        restartLocalService: vi.fn().mockResolvedValue({ ok: true, error: '' }),
      },
      writable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete window.dao;
  });

  it('uses shadcn components backed by Base UI', () => {
    const source = fs.readFileSync(settingsPanelPath, 'utf8');

    expect(source).toContain('@/components/ui/button.jsx');
    expect(source).toContain('@/components/ui/card.jsx');
    expect(source).not.toContain('@heroui');
  });

  it('delegates settings surface geometry to the shared card component', () => {
    const source = fs.readFileSync(settingsPanelPath, 'utf8');

    expect(source.match(/<Card\b/g)).toHaveLength(2);
    expect(source).not.toMatch(/rounded-|border-radius|borderRadius/);
  });

  it('drains pending note saves before restarting the Go service', async () => {
    let finishDraining;
    waitForAllPendingNoteSaves.mockReturnValue(
      new Promise((resolve) => {
        finishDraining = resolve;
      }),
    );

    render(
      createElement(SettingsPanel, {
        currentWorkingDirectory: { path: '/tmp/dao' },
        onReplayOnboarding: vi.fn(),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));

    expect(waitForAllPendingNoteSaves).toHaveBeenCalledOnce();
    expect(window.dao.restartLocalService).not.toHaveBeenCalled();

    finishDraining();

    await waitFor(() => {
      expect(window.dao.restartLocalService).toHaveBeenCalledOnce();
    });
    expect(screen.getByText('Go service restarted.')).toBeInTheDocument();
  });

  it('does not restart the service when a pending note save fails', async () => {
    waitForAllPendingNoteSaves.mockRejectedValue(new Error('Disk write failed'));

    render(
      createElement(SettingsPanel, {
        currentWorkingDirectory: { path: '/tmp/dao' },
        onReplayOnboarding: vi.fn(),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));

    expect(await screen.findByText('Disk write failed')).toBeInTheDocument();
    expect(window.dao.restartLocalService).not.toHaveBeenCalled();
  });
});
