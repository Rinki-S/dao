import fs from 'node:fs';
import path from 'node:path';

import { createElement } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTask, deleteTask, listTasks, updateTask } from '../api.js';
import { TaskPanel } from './TaskPanel.jsx';

vi.mock('../../projects/api.js', () => ({
  listProjects: vi.fn(async () => [
    {
      id: 'project-1',
      workspaceId: 'workspace-1',
      name: 'Dao Project',
      description: '',
      folderPath: '/tmp/dao-test/personal-workspace-1/dao-project',
      status: 'active',
      startedAt: null,
      endedAt: null,
      createdAt: '2026-05-25T00:00:00Z',
      updatedAt: '2026-05-25T00:00:00Z',
      deletedAt: null,
      version: 1,
      syncStatus: 'synced',
    },
  ]),
}));

vi.mock('../api.js', () => ({
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  listTasks: vi.fn(async () => [
    {
      id: 'task-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      parentId: null,
      title: 'Review HeroUI migration',
      description: 'Check the row trigger behavior.',
      status: 'todo',
      priority: 'high',
      dueDate: null,
      createdAt: '2026-05-25T00:00:00Z',
      updatedAt: '2026-05-25T00:00:00Z',
      deletedAt: null,
      version: 1,
      syncStatus: 'synced',
    },
  ]),
}));

vi.mock('../../activities/events.js', () => ({
  notifyActivityChanged: vi.fn(),
}));

const taskPanelPath = path.resolve(import.meta.dirname, 'TaskPanel.jsx');
const currentWorkspace = {
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

describe('TaskPanel table migration boundary', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses HeroUI for table rows and compact labels instead of shadcn table and badge', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain("from '@heroui/react'");
    expect(source).toContain('Chip');
    expect(source).toContain('Table');
    expect(source).not.toContain("import { Badge } from '@/components/ui/badge'");
    expect(source).not.toContain('import { Table, TableBody, TableCell, TableRow }');
  });

  it('uses HeroUI for the quick add form instead of shadcn form controls', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain('Dropdown');
    expect(source).toContain('Checkbox');
    expect(source).toContain('InputGroup');
    expect(source).toContain('Popover');
    expect(source).toContain('TextArea');
    expect(source).toContain('TextField');
    expect(source).toContain('<Checkbox.Control');
    expect(source).toContain('<Checkbox.Indicator');
    expect(source).not.toContain('@/components/ui/dropdown-menu');
    expect(source).not.toContain('@/components/ui/field');
    expect(source).not.toContain('@/components/ui/input-group');
    expect(source).not.toContain('@/components/ui/popover');
    expect(source).not.toContain('@/components/ui/textarea');
    expect(source).not.toContain('@/components/ui/button');
    expect(source).not.toContain('@/components/ui/checkbox');
    expect(source).not.toContain('@/components/ui/input');
    expect(source).not.toContain('LegacyButton');
    expect(source).not.toContain('LegacyInput');
    expect(source).not.toContain('onCheckedChange');
  });

  it('uses HeroUI ScrollShadow for the task list overflow affordance', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain('ScrollShadow');
    expect(source).toContain('<ScrollShadow');
    expect(source).toContain('orientation="vertical"');
    expect(source).toContain('size={20}');
    expect(source).not.toContain('data-testid="task-scroll-shadow"');
    expect(source).not.toContain('hasTaskScrollOffset');
    expect(source).not.toContain('handleTaskListScroll');
    expect(source).not.toContain('transition-opacity duration-150 ease-out');
    expect(source).not.toContain('className="flex shrink-0 flex-col gap-3 px-8 py-4 border-b"');
    expect(source).toContain('className="flex shrink-0 flex-col gap-3 px-8 py-4"');
    expect(source).toContain('className="h-full min-h-0"');
  });

  it('keeps task details inside the parent task row instead of adding sibling table rows', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain('data-slot="task-row-layout"');
    expect(source).toContain('dataSlot="task-detail"');
    expect(source).toContain('data-slot="task-children"');
    expect(source).not.toContain('id={`${task.id}-description`}');
    expect(source).not.toContain('id={`${task.id}-child-form`}');
    expect(source).not.toContain('id={`${childTask.id}-description`}');
  });

  it('animates task row expansion with GSAP instead of CSS transitions', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain("import { gsap } from 'gsap'");
    expect(source).toContain('function GsapDisclosure');
    expect(source).toContain('gsap.fromTo');
    expect(source).toContain('gsap.to');
    expect(source).toContain('gsap.set');
    expect(source).toContain("overwrite: 'auto'");
    expect(source).toContain('autoAlpha');
    expect(source).toContain('height');
    expect(source).toContain('prefers-reduced-motion: reduce');
    expect(source).not.toContain('grid-template-rows');
    expect(source.match(/transition-\[grid-template-rows\] duration-150 ease-out/g)).toBeNull();
    expect(source.match(/transition-\[grid-template-rows\] duration-200 ease-out/g)).toBeNull();
    expect(source).toContain('dataSlot="task-child-form"');
    expect(source).toContain('hasChildren &&');
    expect(source).toContain('data-slot="task-details-trigger"');
    expect(source).toContain('transition-[background-color,scale] duration-150 ease-out');
    expect(source).toContain('transform-gpu');
    expect(source).toContain('active:scale-[0.96]');
    expect(source).toContain('data-[pressed=true]:scale-[0.96]');
    expect(source).not.toContain('scale-[0.99]');
    expect(source).not.toContain('transition-[opacity,transform] duration-150 ease-out');
    expect(source).not.toContain("'translate-y-0 opacity-100'");
    expect(source).not.toContain("'-translate-y-1 opacity-0'");
    expect(source).not.toContain('taskDetailExitDurationMs');
    expect(source).not.toContain('renderedTaskDetailIds');
    expect(source).not.toContain('scale-y-');
    expect(source).not.toContain('transition-all');
  });

  it('keeps the child todo input visually flat while the child form animates independently', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain('dataSlot="task-child-form"');
    expect(source).toContain('visibleChildTaskParentId');
    expect(source).toContain('setVisibleChildTaskParentId');
    expect(source).toContain('window.requestAnimationFrame');
    expect(source).toContain('window.cancelAnimationFrame');
    expect(source).toContain('px-0.5 py-0.5');
    expect(source).toContain('overflow-visible');
    expect(source).toContain('className="h-8 min-h-8 shadow-none"');
    expect(source).not.toContain(
      "'grid overflow-hidden transition-[grid-template-rows] duration-150 ease-out'",
    );
  });

  it('keeps the quick add input group full width while the add button stays fixed', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain('className="flex w-full flex-col gap-3"');
    expect(source).toContain('className="w-full min-w-0"');
    expect(source).toContain('fullWidth');
    expect(source).toContain('className="flex w-full min-w-0 flex-col gap-2 sm:flex-row"');
    expect(source).toContain('<InputGroup className="w-full min-w-0 flex-1" fullWidth>');
    expect(source).toContain('className="h-9 shrink-0"');
  });

  it('aligns the task table inset with the quick add area', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain('className="flex shrink-0 flex-col gap-3 px-8 py-4"');
    expect(source).toMatch(
      /\{status === 'ready' && parentTasks\.length > 0 && \(\s+<div className="px-8">\s+<Table className="border-b" variant="secondary">/,
    );
  });

  it('uses the task title area as the details trigger instead of caret and note menu buttons', async () => {
    const user = userEvent.setup();
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    render(createElement(TaskPanel, { currentWorkspace }));

    const trigger = await screen.findByRole('button', {
      name: 'Expand details for Review HeroUI migration',
    });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /Expand Review HeroUI migration/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Show notes for Review HeroUI migration/ }),
    ).toBeNull();
    expect(source).not.toContain('ArrowRight01Icon');
    expect(source).not.toContain('MoreHorizontalIcon');

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps task context menu icon colors aligned with their labels', () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    expect(source).toContain(
      '<HugeiconsIcon icon={Edit02Icon} aria-hidden="true" className="size-4" />',
    );
    expect(source).toContain('className="hover:bg-danger-soft-hover');
    expect(source).toMatch(
      /<HugeiconsIcon\s+icon=\{Delete02Icon\}\s+aria-hidden="true"\s+className="size-4 text-danger"\s+\/>/,
    );
    expect(source).not.toContain(
      'icon={Edit02Icon} aria-hidden="true" className="size-4 text-muted"',
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

  it('keeps the quick add accessory controls visible and visually subdued', async () => {
    const source = fs.readFileSync(taskPanelPath, 'utf8');

    render(createElement(TaskPanel, { currentWorkspace }));

    await screen.findByPlaceholderText('Add a task...');

    expect(screen.getByRole('button', { name: 'Select project' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Select priority' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit description' })).toBeVisible();
    expect(source).toContain('[--button-fg:var(--field-placeholder)]');
    expect(source).toContain('hover:[--button-fg:var(--field-foreground)]');
    expect(source).not.toContain('--muted-foreground');
  });

  it('renders task rows through the HeroUI task table', async () => {
    render(createElement(TaskPanel, { currentWorkspace }));

    expect(await screen.findByRole('grid', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.getByText('Review HeroUI migration')).toBeInTheDocument();
    expect(screen.getByText('/Dao Project')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('creates a task from the HeroUI quick add form', async () => {
    const user = userEvent.setup();
    render(createElement(TaskPanel, { currentWorkspace }));

    const titleInput = await screen.findByPlaceholderText('Add a task...');
    await user.type(titleInput, 'Write migration notes');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(createTask).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      projectId: null,
      title: 'Write migration notes',
      description: '',
      priority: 'medium',
      dueDate: null,
    });
  });

  it('keeps the task list mounted while creating a child todo', async () => {
    const user = userEvent.setup();
    let resolveTaskReload;

    listTasks
      .mockResolvedValueOnce([
        {
          id: 'task-1',
          workspaceId: 'workspace-1',
          projectId: 'project-1',
          parentId: null,
          title: 'Review HeroUI migration',
          description: 'Check the row trigger behavior.',
          status: 'todo',
          priority: 'high',
          dueDate: null,
          createdAt: '2026-05-25T00:00:00Z',
          updatedAt: '2026-05-25T00:00:00Z',
          deletedAt: null,
          version: 1,
          syncStatus: 'synced',
        },
      ])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveTaskReload = resolve;
          }),
      );

    render(createElement(TaskPanel, { currentWorkspace }));

    const addChildButton = await screen.findByRole('button', {
      name: 'Add child todo to Review HeroUI migration',
    });

    await user.click(addChildButton);
    await user.type(await screen.findByLabelText('Child todo for Review HeroUI migration'), 'Ship');
    await user.click(screen.getAllByRole('button', { name: 'Add' }).at(-1));

    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledTimes(2);
    });

    expect(screen.queryByText('Loading tasks...')).not.toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Tasks' })).toBeInTheDocument();

    resolveTaskReload([
      {
        id: 'task-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        parentId: null,
        title: 'Review HeroUI migration',
        description: 'Check the row trigger behavior.',
        status: 'doing',
        priority: 'high',
        dueDate: null,
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        deletedAt: null,
        version: 2,
        syncStatus: 'synced',
      },
      {
        id: 'task-2',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        parentId: 'task-1',
        title: 'Ship',
        description: '',
        status: 'todo',
        priority: 'high',
        dueDate: null,
        createdAt: '2026-05-25T00:00:00Z',
        updatedAt: '2026-05-25T00:00:00Z',
        deletedAt: null,
        version: 1,
        syncStatus: 'synced',
      },
    ]);
  });

  it('opens a right-click task menu and edits the task', async () => {
    const user = userEvent.setup();
    updateTask.mockResolvedValue({
      id: 'task-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      parentId: null,
      title: 'Updated task',
      description: 'Updated description',
      status: 'todo',
      priority: 'high',
      dueDate: null,
      createdAt: '2026-05-25T00:00:00Z',
      updatedAt: '2026-05-25T01:00:00Z',
      deletedAt: null,
      version: 2,
      syncStatus: 'local',
    });

    render(createElement(TaskPanel, { currentWorkspace }));

    const trigger = await screen.findByRole('button', {
      name: 'Expand details for Review HeroUI migration',
    });

    fireEvent.contextMenu(trigger, { clientX: 120, clientY: 160 });
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));

    expect(await screen.findByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();

    const titleInput = screen.getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated task');
    await user.clear(screen.getByLabelText('Description'));
    await user.type(screen.getByLabelText('Description'), 'Updated description');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateTask).toHaveBeenCalledWith('task-1', {
      title: 'Updated task',
      description: 'Updated description',
      priority: 'high',
      dueDate: null,
      projectId: 'project-1',
    });
  });

  it('asks for confirmation before deleting a task from the right-click menu', async () => {
    const user = userEvent.setup();
    deleteTask.mockResolvedValue(undefined);

    render(createElement(TaskPanel, { currentWorkspace }));

    const trigger = await screen.findByRole('button', {
      name: 'Expand details for Review HeroUI migration',
    });

    fireEvent.contextMenu(trigger, { clientX: 120, clientY: 160 });
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(deleteTask).not.toHaveBeenCalled();
    const deleteDialog = await screen.findByRole('dialog', { name: 'Delete task' });
    expect(deleteDialog).toBeInTheDocument();
    expect(within(deleteDialog).getByText('Review HeroUI migration')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteTask).toHaveBeenCalledWith('task-1');
  });
});
