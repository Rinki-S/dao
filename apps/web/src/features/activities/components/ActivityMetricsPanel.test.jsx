import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityMetricsPanel } from './ActivityMetricsPanel.jsx';
import * as activityApi from '../api.js';
import { notifyActivityChanged } from '../events.js';

describe('ActivityMetricsPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders progress signal metrics', async () => {
    vi.spyOn(activityApi, 'getActivityMetrics').mockResolvedValue({
      totalCount: 8,
      workspaceCount: 1,
      projectCount: 2,
      taskCount: 3,
      noteCount: 2,
    });

    render(<ActivityMetricsPanel />);

    expect(screen.getByText('Loading progress signals...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Total')).toBeInTheDocument();
    });

    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Workspaces')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('renders an empty state when there are no progress signals', async () => {
    vi.spyOn(activityApi, 'getActivityMetrics').mockResolvedValue({
      totalCount: 0,
      workspaceCount: 0,
      projectCount: 0,
      taskCount: 0,
      noteCount: 0,
    });

    render(<ActivityMetricsPanel />);

    expect(await screen.findByText('No progress signals yet.')).toBeInTheDocument();
  });

  it('renders an error state when metrics fail to load', async () => {
    vi.spyOn(activityApi, 'getActivityMetrics').mockRejectedValue(
      new Error('Failed to load activity metrics: 500'),
    );

    render(<ActivityMetricsPanel />);

    expect(await screen.findByText('Failed to load activity metrics: 500')).toBeInTheDocument();
  });

  it('reloads metrics when activity changes', async () => {
    vi.spyOn(activityApi, 'getActivityMetrics')
      .mockResolvedValueOnce({
        totalCount: 1,
        workspaceCount: 1,
        projectCount: 0,
        taskCount: 0,
        noteCount: 0,
      })
      .mockResolvedValueOnce({
        totalCount: 2,
        workspaceCount: 1,
        projectCount: 1,
        taskCount: 0,
        noteCount: 0,
      });

    render(<ActivityMetricsPanel />);

    await waitFor(() => {
      expect(activityApi.getActivityMetrics).toHaveBeenCalledTimes(1);
    });

    notifyActivityChanged();

    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(activityApi.getActivityMetrics).toHaveBeenCalledTimes(2);
  });
});
