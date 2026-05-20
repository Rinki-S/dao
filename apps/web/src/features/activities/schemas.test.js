import { describe, expect, it } from 'vitest';
import { ActivityListSchema } from './schemas.js';

describe('ActivityListSchema', () => {
  it('parses activity API responses', () => {
    const activities = ActivityListSchema.parse([
      {
        id: 'activity-1',
        workspaceId: 'workspace-1',
        projectId: null,
        entityType: 'workspace',
        entityId: 'workspace-1',
        action: 'created',
        metadataJson: '{"name":"Personal"}',
        createdAt: '2026-05-20T00:00:00Z',
      },
      {
        id: 'activity-2',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        entityType: 'task',
        entityId: 'task-1',
        action: 'created',
        metadataJson: '{"title":"Build activity log"}',
        createdAt: '2026-05-20T00:05:00Z',
      },
    ]);

    expect(activities).toHaveLength(2);
  });

  it('rejects unsupported activity actions', () => {
    expect(() =>
      ActivityListSchema.parse([
        {
          id: 'activity-1',
          workspaceId: 'workspace-1',
          projectId: null,
          entityType: 'workspace',
          entityId: 'workspace-1',
          action: 'deleted',
          metadataJson: '{}',
          createdAt: '2026-05-20T00:00:00Z',
        },
      ]),
    ).toThrow();
  });
});
