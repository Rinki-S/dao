import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette.jsx';

function renderCommandPaletteWithTargets() {
  return render(
    <>
      <CommandPalette />
      <section id="workspaces">
        <input data-command-target="workspace-name" aria-label="Workspace name" />
      </section>
      <section id="projects">
        <input data-command-target="project-name" aria-label="Project name" />
      </section>
      <section id="tasks">
        <input data-command-target="task-title" aria-label="Task title" />
      </section>
      <section id="notes">
        <input data-command-target="note-title" aria-label="Note title" />
      </section>
      <section id="search">
        <input data-command-target="search-query" aria-label="Search query" />
      </section>
      <section id="settings" />
    </>,
  );
}

describe('CommandPalette', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('opens with the command palette shortcut and closes with Escape', async () => {
    const user = userEvent.setup();

    renderCommandPaletteWithTargets();

    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument();

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');

    expect(screen.getByRole('dialog', { name: 'Command Palette' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument();
  });

  it('filters commands from the query input', async () => {
    const user = userEvent.setup();

    renderCommandPaletteWithTargets();

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(screen.getByPlaceholderText('Type a command'), 'preferences');

    expect(screen.getByRole('option', { name: /Open Settings/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Create Task/ })).not.toBeInTheDocument();
  });

  it('runs the selected command on Enter', async () => {
    const user = userEvent.setup();

    renderCommandPaletteWithTargets();

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(screen.getByPlaceholderText('Type a command'), 'search');
    await user.keyboard('{Enter}');

    expect(window.location.hash).toBe('#search');
    expect(screen.getByLabelText('Search query')).toHaveFocus();
    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument();
  });

  it('moves selection with arrow keys before running a command', async () => {
    const user = userEvent.setup();

    renderCommandPaletteWithTargets();

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(screen.getByPlaceholderText('Type a command'), 'open');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(window.location.hash).toBe('#projects');
  });

  it('runs the switch workspace command', async () => {
    const user = userEvent.setup();

    renderCommandPaletteWithTargets();

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(screen.getByPlaceholderText('Type a command'), 'switch workspace');
    await user.keyboard('{Enter}');

    expect(window.location.hash).toBe('#workspaces');
    expect(screen.getByLabelText('Workspace name')).toHaveFocus();
  });
});
