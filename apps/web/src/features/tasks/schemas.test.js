import { describe, expect, it } from 'vitest';
import {
  CreateTaskInputSchema,
  TaskListSchema,
  TaskSchema,
  UpdateTaskInputSchema,
  UpdateTaskStatusInputSchema,
} from './schemas.js';

function taskResponse(overrides = {}) {
  return {
    id: 'task-1',
    workspaceId: 'workspace-1',
    projectId: null,
    parentId: null,
    title: 'Task',
    description: '',
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    createdAt: '2026-05-25T00:00:00Z',
    updatedAt: '2026-05-25T00:00:00Z',
    deletedAt: null,
    version: 1,
    syncStatus: 'local',
    ...overrides,
  };
}

describe('TaskSchema', () => {
  it('parses complete task API responses', () => {
    const task = TaskSchema.parse(taskResponse());

    expect(task.id).toBe('task-1');
  });

  it('rejects unsupported task status and priority values', () => {
    expect(() => TaskSchema.parse(taskResponse({ status: 'blocked' }))).toThrow();
    expect(() => TaskSchema.parse(taskResponse({ priority: 'urgent' }))).toThrow();
  });
});

describe('TaskListSchema', () => {
  it('rejects task list items with missing fields', () => {
    expect(() =>
      TaskListSchema.parse([
        {
          id: 'task-1',
          title: 'Missing fields',
        },
      ]),
    ).toThrow();
  });
});

describe('CreateTaskInputSchema', () => {
  it('trims create input strings and applies defaults', () => {
    const input = CreateTaskInputSchema.parse({
      workspaceId: ' workspace-1 ',
      projectId: null,
      title: ' Task title ',
      description: ' Task description ',
      dueDate: null,
    });

    expect(input).toEqual({
      workspaceId: 'workspace-1',
      projectId: null,
      parentId: null,
      title: 'Task title',
      description: 'Task description',
      priority: 'medium',
      dueDate: null,
    });
  });
});

describe('UpdateTaskInputSchema', () => {
  it('rejects empty task update payloads', () => {
    expect(() => UpdateTaskInputSchema.parse({})).toThrow('Task update payload is required');
  });
});

describe('UpdateTaskStatusInputSchema', () => {
  it('allows todo and done status updates only', () => {
    expect(UpdateTaskStatusInputSchema.parse({ status: 'todo' })).toEqual({ status: 'todo' });
    expect(UpdateTaskStatusInputSchema.parse({ status: 'done' })).toEqual({ status: 'done' });
    expect(() => UpdateTaskStatusInputSchema.parse({ status: 'doing' })).toThrow();
  });
});
