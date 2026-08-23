import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTaskDocument, updateTaskDocument } from './api.js';

function documentResponse(overrides = {}) {
  return {
    workspaceId: 'workspace-1',
    content: '# Tasks\n\n- [ ] Fix parser recovery @due(2026-08-25) !high\n',
    filePath: '/tmp/dao-test/tasks.md',
    updatedAt: '2026-05-25T00:00:00Z',
    ...overrides,
  };
}

describe('tasks api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the workspace task document', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(documentResponse()), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const document = await getTaskDocument('workspace-1');

    expect(document.content).toContain('Fix parser recovery');
    // The workspace is what selects the file, so it has to reach the service.
    expect(fetchMock.mock.calls[0][0]).toBe('/api/tasks?workspaceId=workspace-1');
  });

  it('writes the workspace task document', async () => {
    const content = '# Tasks\n\n- [x] Ship v2\n';
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(documentResponse({ content })), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const document = await updateTaskDocument('workspace-1', { content });

    expect(document.content).toBe(content);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/tasks?workspaceId=workspace-1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ content });
  });

  it('rejects a response that is not a task document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ workspaceId: 'workspace-1' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
      ),
    );

    await expect(getTaskDocument('workspace-1')).rejects.toThrow();
  });

  it('reports a failed read rather than returning an empty document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );

    await expect(getTaskDocument('workspace-1')).rejects.toThrow('Failed to read tasks: 500');
  });
});
