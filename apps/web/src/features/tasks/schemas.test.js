import { describe, expect, it } from 'vitest';
import { TaskDocumentSchema, UpdateTaskDocumentInputSchema } from './schemas.js';

describe('TaskDocumentSchema', () => {
  it('parses a task document', () => {
    const document = TaskDocumentSchema.parse({
      workspaceId: 'workspace-1',
      content: '# Tasks\n\n- [ ] Fix parser recovery @due(2026-08-25) !high\n',
      filePath: '/tmp/dao-test/tasks.md',
      updatedAt: '2026-05-25T00:00:00Z',
    });

    expect(document.filePath).toBe('/tmp/dao-test/tasks.md');
  });

  it('rejects a document without content', () => {
    expect(() =>
      TaskDocumentSchema.parse({
        workspaceId: 'workspace-1',
        filePath: '/tmp/dao-test/tasks.md',
        updatedAt: '2026-05-25T00:00:00Z',
      }),
    ).toThrow();
  });
});

describe('UpdateTaskDocumentInputSchema', () => {
  it('accepts an empty document, which is what deleting every task looks like', () => {
    expect(UpdateTaskDocumentInputSchema.parse({ content: '' })).toEqual({ content: '' });
  });

  it('rejects a payload with no content', () => {
    expect(() => UpdateTaskDocumentInputSchema.parse({})).toThrow();
  });
});
