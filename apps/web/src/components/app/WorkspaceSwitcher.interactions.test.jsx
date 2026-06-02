import { createElement, useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceSwitcher } from './WorkspaceSwitcher.jsx';

const workspace = {
  id: 'workspace-1',
  name: 'Personal',
  description: '',
  rootPath: '/tmp/dao-test/personal-workspace-1',
  createdAt: '2026-05-25T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
  deletedAt: null,
  version: 1,
  syncStatus: 'synced',
};

function WorkspaceSwitcherHarness({ onCreateWorkspace }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return createElement(WorkspaceSwitcher, {
    workspaces: [workspace],
    currentWorkspace: workspace,
    isLoading: false,
    error: '',
    menuOpen,
    onMenuOpenChange: setMenuOpen,
    createDialogOpen,
    onCreateDialogOpenChange: setCreateDialogOpen,
    onSelectWorkspace: vi.fn(),
    onCreateWorkspace,
  });
}

describe('WorkspaceSwitcher interactions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the create workspace dialog open when creation fails', async () => {
    const user = userEvent.setup();
    const onCreateWorkspace = vi.fn().mockRejectedValue(new Error('Unable to create workspace'));

    render(createElement(WorkspaceSwitcherHarness, { onCreateWorkspace }));

    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Create workspace' }));

    const dialog = await screen.findByRole('dialog', { name: 'Create workspace' });
    await user.type(within(dialog).getByLabelText('Workspace name'), 'New Workspace');
    await user.click(within(dialog).getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => {
      expect(onCreateWorkspace).toHaveBeenCalledTimes(1);
    });

    expect(await within(dialog).findByText('Unable to create workspace')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Create workspace' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Workspace name')).toHaveValue('New Workspace');
    expect(within(dialog).getByRole('button', { name: 'Create workspace' })).toBeEnabled();
  });

  it('clears stale create workspace errors when reopened from the workspace menu', async () => {
    const user = userEvent.setup();
    const onCreateWorkspace = vi.fn().mockRejectedValue(new Error('Unable to create workspace'));

    render(createElement(WorkspaceSwitcherHarness, { onCreateWorkspace }));

    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Create workspace' }));

    const firstDialog = await screen.findByRole('dialog', { name: 'Create workspace' });
    await user.type(within(firstDialog).getByLabelText('Workspace name'), 'New Workspace');
    await user.click(within(firstDialog).getByRole('button', { name: 'Create workspace' }));

    expect(await within(firstDialog).findByText('Unable to create workspace')).toBeInTheDocument();

    await user.click(within(firstDialog).getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Create workspace' })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Create workspace' }));

    const reopenedDialog = await screen.findByRole('dialog', { name: 'Create workspace' });
    expect(within(reopenedDialog).queryByText('Unable to create workspace')).toBeNull();
  });
});
