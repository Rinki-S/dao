import fs from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette.jsx';

const commandPalettePath = path.resolve(import.meta.dirname, 'CommandPalette.jsx');

function renderCommandPaletteWithTargets() {
  return render(
    <>
      <CommandPalette />
      <section id="tasks">
        <input data-command-target="task-title" aria-label="Task title" />
      </section>
      <section id="settings" />
    </>,
  );
}

function renderCommandPaletteWithActions(onRunAction) {
  return render(<CommandPalette onRunAction={onRunAction} />);
}

describe('CommandPalette', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('uses cmdk directly with a HeroUI shell instead of the legacy command wrappers', () => {
    const source = fs.readFileSync(commandPalettePath, 'utf8');

    expect(source).toContain("from '@heroui/react'");
    expect(source).toContain("from 'cmdk'");
    expect(source).toContain('CommandPrimitive');
    expect(source).toContain('Modal');
    expect(source).toContain('Kbd');
    expect(source).not.toContain('@/components/ui/command');
    expect(source).not.toContain('@/components/ui/kbd');
  });

  it('uses HeroUI color tokens for the cmdk surface', () => {
    const source = fs.readFileSync(commandPalettePath, 'utf8');

    expect(source).toContain('bg-surface');
    expect(source).toContain('text-surface-foreground');
    expect(source).toContain('bg-field');
    expect(source).toContain('text-field-foreground');
    expect(source).toContain('placeholder:text-field-placeholder');
    expect(source).toContain('bg-accent-soft');
    expect(source).toContain('text-danger');
    expect(source).not.toMatch(
      /\b(bg-popover|text-popover-foreground|border-input|bg-input|border-ring|ring-ring|bg-muted|text-destructive|text-muted-foreground)\b/,
    );
  });

  it('centers above the app titlebar overlay layer', () => {
    const source = fs.readFileSync(commandPalettePath, 'utf8');

    expect(source).toContain('<Modal.Backdrop className="z-[200]!"');
    expect(source).toContain('<Modal.Container placement="center" size="sm">');
    expect(source).not.toContain('placement="top"');
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

  it('groups commands by command group', async () => {
    const user = userEvent.setup();

    renderCommandPaletteWithTargets();

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');

    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Navigate')).toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    expect(screen.queryByText('Other Commands')).not.toBeInTheDocument();
  });

  it('runs the selected surface command on Enter', async () => {
    const user = userEvent.setup();

    renderCommandPaletteWithTargets();

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(screen.getByPlaceholderText('Type a command'), 'settings');
    await user.keyboard('{Enter}');

    expect(window.location.hash).toBe('#settings');
    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument();
  });

  it('moves selection with arrow keys before running a command', async () => {
    const user = userEvent.setup();

    renderCommandPaletteWithTargets();

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(screen.getByPlaceholderText('Type a command'), 'create');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(window.location.hash).toBe('#tasks');
  });

  it('runs the switch workspace action command', async () => {
    const user = userEvent.setup();
    const onRunAction = vi.fn();

    renderCommandPaletteWithActions(onRunAction);

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(screen.getByPlaceholderText('Type a command'), 'switch workspace');
    await user.keyboard('{Enter}');

    expect(onRunAction).toHaveBeenCalledWith(
      'switch-workspace',
      expect.objectContaining({ id: 'switch-workspace' }),
    );
    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument();
  });

  it('runs the create workspace action command', async () => {
    const user = userEvent.setup();
    const onRunAction = vi.fn();

    renderCommandPaletteWithActions(onRunAction);

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(screen.getByPlaceholderText('Type a command'), 'create workspace');
    await user.keyboard('{Enter}');

    expect(onRunAction).toHaveBeenCalledWith(
      'create-workspace',
      expect.objectContaining({ id: 'create-workspace' }),
    );
  });

  it('runs the search action command', async () => {
    const user = userEvent.setup();
    const onRunAction = vi.fn();

    renderCommandPaletteWithActions(onRunAction);

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(screen.getByPlaceholderText('Type a command'), 'search');
    await user.keyboard('{Enter}');

    expect(onRunAction).toHaveBeenCalledWith(
      'focus-search',
      expect.objectContaining({ id: 'open-search' }),
    );
  });
});
