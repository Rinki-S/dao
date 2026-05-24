import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { notifyActivityChanged } from '../../activities/events.js';
import { createWorkspace, listWorkspaces } from '../api.js';

export function WorkspacePanel() {
  const [workspaces, setWorkspaces] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  async function loadWorkspaces() {
    setStatus('loading');
    setError('');

    const nextWorkspaces = await listWorkspaces();

    setWorkspaces(nextWorkspaces);
    setStatus('ready');
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setStatus('loading');
        setError('');

        const nextWorkspaces = await listWorkspaces();

        if (!cancelled) {
          setWorkspaces(nextWorkspaces);
          setStatus('ready');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load workspaces');
          setStatus('error');
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateWorkspace(event) {
    event.preventDefault();

    try {
      setIsCreating(true);
      setError('');

      await createWorkspace({
        name: workspaceName,
        description: workspaceDescription,
      });

      setWorkspaceName('');
      setWorkspaceDescription('');
      await loadWorkspaces();
      notifyActivityChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
      setStatus('error');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Card id="workspaces" className="max-w-3xl">
      <CardHeader>
        <CardTitle>Workspaces</CardTitle>
        <CardDescription>Create the first local container for Dao.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <form className="flex flex-col gap-3" onSubmit={handleCreateWorkspace}>
          <label className="sr-only" htmlFor="workspace-name">
            Workspace name
          </label>
          <Input
            id="workspace-name"
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
            placeholder="Workspace name"
            data-command-target="workspace-name"
          />

          <label className="sr-only" htmlFor="workspace-description">
            Description
          </label>
          <Input
            id="workspace-description"
            value={workspaceDescription}
            onChange={(event) => setWorkspaceDescription(event.target.value)}
            placeholder="Description"
          />

          <Button className="w-fit" disabled={isCreating} type="submit">
            {isCreating ? 'Creating...' : 'Create workspace'}
          </Button>
        </form>

        {status === 'loading' && (
          <p className="text-sm text-muted-foreground">Loading workspaces...</p>
        )}

        {status === 'error' && <p className="text-sm text-destructive">{error}</p>}

        {status === 'ready' && workspaces.length === 0 && (
          <p className="text-sm text-muted-foreground">No workspaces yet.</p>
        )}

        {status === 'ready' && workspaces.length > 0 && (
          <ul className="flex flex-col gap-2">
            {workspaces.map((workspace) => (
              <li key={workspace.id} className="rounded-md border border-border px-3 py-3">
                <strong className="block text-sm font-medium text-foreground">
                  {workspace.name}
                </strong>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {workspace.description || 'No description'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
