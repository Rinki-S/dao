import fs from 'node:fs';
import path from 'node:path';

import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listProjects } from '../../projects/api.js';
import { listTasks } from '../api.js';
import { TaskPanel } from './TaskPanel.jsx';
import { currentWorkspace, projectFixture, taskFixture } from './TaskPanel.test-utils.js';

vi.mock('../../projects/api.js', () => ({
  listProjects: vi.fn(),
}));

vi.mock('../api.js', () => ({
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  listTasks: vi.fn(),
}));

vi.mock('../../activities/events.js', () => ({
  notifyActivityChanged: vi.fn(),
}));

const taskPanelPath = path.resolve(import.meta.dirname, 'TaskPanel.jsx');

describe('TaskPanel shadcn Base UI migration boundary', () => {
  beforeEach(() => {
    listProjects.mockResolvedValue([projectFixture()]);
    listTasks.mockResolvedValue([taskFixture()]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses shadcn Base UI and Tabler without legacy component libraries', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain("from '@tabler/icons-react'");
    expect(source).toContain("from '@/components/ui/badge'");
    expect(source).toContain("from '@/components/ui/table'");
    expect(source).toContain('<Badge');
    expect(source).toContain('<Table');
    const forbiddenLegacyTokens = [
      '@hero' + 'ui',
      'huge' + 'icons',
      'ra' + 'dix-ui',
      '@ra' + 'dix-ui',
      'is' + 'Disabled',
      'is' + 'Pending',
      'is' + 'IconOnly',
      'on' + 'Press',
      'full' + 'Width',
      'validation' + 'Behavior',
    ];

    for (const token of forbiddenLegacyTokens) {
      expect(source).not.toContain(token);
    }

    expect(source).not.toMatch(new RegExp(`\\b${'as' + 'Child'}\\b`));
  });

  it('composes Base form, menu, select, dialog, and checkbox primitives correctly', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain('<FieldGroup');
    expect(source).toContain('<Field ');
    expect(source).toContain('<InputGroupInput');
    expect(source).toContain('<InputGroupAddon');
    expect(source).toContain('<InputGroupButton');
    expect(source).toContain('items={priorityOptions}');
    expect(source).toContain('<SelectGroup>');
    expect(source).toContain('<DialogTitle>Edit task</DialogTitle>');
    expect(source).toContain('<AlertDialogTitle>Delete task</AlertDialogTitle>');
    expect(source).toContain('<ContextMenuGroup>');
    expect(source).toContain('checked={checkboxState === true}');
    expect(source).toContain("indeterminate={checkboxState === 'indeterminate'}");
    expect(source).toContain('onCheckedChange');
    expect(source).not.toMatch(/<InputGroup\.(?:Input|Suffix)|<Dropdown\.|<Modal\./);
  });

  it('uses shadcn surfaces without consumer rounded utilities', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain('<Empty');
    expect(source).toContain('<EmptyMedia variant="icon">');
    expect(source).toContain('<ScrollArea className="h-full min-h-0">');
    expect(source).toContain('<Skeleton');
    expect(source).not.toMatch(/\brounded(?:-\[[^\]]+\]|-[a-z0-9-]+)?\b/);
    expect(source).not.toMatch(/borderRadius|border-radius/);
  });

  it('keeps task details inside the parent task row', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain('data-slot="task-row-layout"');
    expect(source).toContain('dataSlot="task-detail"');
    expect(source).toContain('data-slot="task-children"');
    expect(source).not.toContain('id={`${task.id}-description`}');
    expect(source).not.toContain('id={`${task.id}-child-form`}');
    expect(source).not.toContain('id={`${childTask.id}-description`}');
  });

  it('animates task row expansion with GSAP', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain("import { gsap } from 'gsap'");
    expect(source).toContain('function GsapDisclosure');
    expect(source).toContain('gsap.fromTo');
    expect(source).toContain('gsap.to');
    expect(source).toContain('gsap.set');
    expect(source).toContain("overwrite: 'auto'");
    expect(source).toContain('autoAlpha');
    expect(source).toContain('prefers-reduced-motion: reduce');
    expect(source).toContain('dataSlot="task-child-form"');
    expect(source).toContain('data-slot="task-details-trigger"');
    expect(source).toContain('transition-[background-color,scale] duration-150 ease-out');
    expect(source).toContain('transform-gpu');
    expect(source).toContain('active:scale-[0.96]');
    expect(source).toContain('data-pressed:scale-[0.96]');
    expect(source).not.toContain('grid-template-rows');
    expect(source).not.toContain('transition-all');
  });

  it('keeps the child todo input flat while its disclosure animates independently', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain('visibleChildTaskParentId');
    expect(source).toContain('setVisibleChildTaskParentId');
    expect(source).toContain('window.requestAnimationFrame');
    expect(source).toContain('window.cancelAnimationFrame');
    expect(source).toContain('contentClassName="px-0.5 py-0.5"');
    expect(source).toContain('className="h-8 min-h-8 shadow-none"');
  });

  it('keeps the quick add input group fluid and the add button fixed', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain('className="flex w-full min-w-0 flex-col gap-2 sm:flex-row"');
    expect(source).toContain('<InputGroup className="w-full min-w-0 flex-1">');
    expect(source).toContain('className="h-9 shrink-0"');
  });

  it('aligns the task table inset with the quick add area', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain('className="flex shrink-0 flex-col gap-3 px-8 py-4"');
    expect(source).toMatch(
      /\{status === 'ready' && parentTasks\.length > 0 && \(\s+<div className="px-8">\s+<Table aria-label="Tasks" className="border-b">/,
    );
  });

  it('uses the task title area as the details trigger', async () => {
    const user = userEvent.setup();
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    render(createElement(TaskPanel, { currentWorkspace }));

    const trigger = await screen.findByRole('button', {
      name: 'Expand details for Review component migration',
    });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /Expand Review component migration/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Show notes for Review component migration/ }),
    ).toBeNull();
    expect(source).not.toContain('IconChevronRight');
    expect(source).not.toContain('IconDots');

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('groups task context actions and marks delete as destructive', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain('<ContextMenuGroup>');
    expect(source).toContain('<IconEdit aria-hidden="true" />');
    expect(source).toContain('<IconTrash aria-hidden="true" />');
    expect(source).toContain(
      '<ContextMenuItem variant="destructive" onClick={() => openDeleteTaskDialog(task)}>',
    );
  });

  it('keeps the quick add button visible and disables it until a title is entered', async () => {
    const user = userEvent.setup();
    render(createElement(TaskPanel, { currentWorkspace }));

    const titleInput = await screen.findByPlaceholderText('Add a task...');
    const addButton = screen.getByRole('button', { name: 'Add' });

    expect(addButton).toBeDisabled();

    await user.type(titleInput, 'Write migration notes');

    expect(addButton).toBeEnabled();
  });

  it('keeps the quick add accessory controls accessible through Base triggers', async () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    render(createElement(TaskPanel, { currentWorkspace }));

    await screen.findByPlaceholderText('Add a task...');

    expect(screen.getByRole('button', { name: 'Select project' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Select priority' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit description' })).toBeVisible();
    expect(source).toContain('<DropdownMenuTrigger');
    expect(source).toContain('<PopoverTrigger');
    expect(source).toContain('render={');
  });

  it('separates API errors from form controls and composes loading spinners', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain('function TaskApiErrorMessage');
    expect(source).toContain('role="alert"');
    expect(source).toContain('{quickAddError || taskActionError}');
    expect(source).toContain('{childTaskError}');
    expect(source).toContain('{editTaskError}');
    expect(source).toContain('{deleteTaskError}');
    expect(source).toContain('<Spinner data-icon="inline-start" />');
  });

  it('renders task rows through the semantic shadcn table', async () => {
    render(createElement(TaskPanel, { currentWorkspace }));

    expect(await screen.findByRole('table', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.getByText('Review component migration')).toBeInTheDocument();
    expect(screen.getByText('/Dao Project')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });
});
