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

describe('SettingsPanel HeroUI migration boundary', () => {
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

  it('uses HeroUI directly instead of the legacy shadcn ui layer', () => {
    const source = fs.readFileSync(settingsPanelPath, 'utf8');

    expect(source).toContain("from '@heroui/react'");
    expect(source).not.toContain('@/components/ui/');
  });

  it('configures rounded settings surfaces explicitly', () => {
    const source = fs.readFileSync(settingsPanelPath, 'utf8');
    const roundedDefaultSurfaces =
      source.match(/<Surface[\s\S]*?className="[^"]*rounded-xl[^"]*"[\s\S]*?variant="default"/g) ??
      [];

    expect(roundedDefaultSurfaces).toHaveLength(2);
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
