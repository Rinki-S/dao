import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { notifyActivityChanged } from '../../activities/events.js';
import { listWorkspaces } from '../../workspaces/api.js';
import { createProject, listProjects } from '../api.js';

export function ProjectPanel() {
  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const selectedWorkspace = useMemo(() => {
    return workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  }, [workspaces, selectedWorkspaceId]);

  const visibleProjects = useMemo(() => {
    if (!selectedWorkspaceId) {
      return projects;
    }

    return projects.filter((project) => project.workspaceId === selectedWorkspaceId);
  }, [projects, selectedWorkspaceId]);

  async function loadProjectData() {
    setStatus('loading');
    setError('');

    const [nextWorkspaces, nextProjects] = await Promise.all([listWorkspaces(), listProjects()]);

    setWorkspaces(nextWorkspaces);
    setProjects(nextProjects);

    if (!selectedWorkspaceId && nextWorkspaces.length > 0) {
      setSelectedWorkspaceId(nextWorkspaces[0].id);
    }

    setStatus('ready');
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setStatus('loading');
        setError('');

        const [nextWorkspaces, nextProjects] = await Promise.all([
          listWorkspaces(),
          listProjects(),
        ]);

        if (cancelled) {
          return;
        }

        setWorkspaces(nextWorkspaces);
        setProjects(nextProjects);

        if (nextWorkspaces.length > 0) {
          setSelectedWorkspaceId(nextWorkspaces[0].id);
        }

        setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load projects');
          setStatus('error');
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateProject(event) {
    event.preventDefault();

    if (!selectedWorkspaceId) {
      setError('Create a workspace before adding projects');
      return;
    }

    try {
      setIsCreating(true);
      setError('');

      await createProject({
        workspaceId: selectedWorkspaceId,
        name: projectName,
        description: projectDescription,
      });

      setProjectName('');
      setProjectDescription('');
      await loadProjectData();
      notifyActivityChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setStatus('error');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Card id="projects" className="mt-6 max-w-3xl">
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardDescription>Create projects inside the selected workspace.</CardDescription>
        {selectedWorkspace && (
          <CardAction>
            <Badge variant="outline">{selectedWorkspace.name}</Badge>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {workspaces.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Workspace</span>
            <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select workspace" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
        )}

        <form className="flex flex-col gap-3" onSubmit={handleCreateProject}>
          <label className="sr-only" htmlFor="project-name">
            Project name
          </label>
          <Input
            id="project-name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Project name"
            disabled={workspaces.length === 0}
            data-command-target="project-name"
          />

          <label className="sr-only" htmlFor="project-description">
            Description
          </label>
          <Input
            id="project-description"
            value={projectDescription}
            onChange={(event) => setProjectDescription(event.target.value)}
            placeholder="Description"
            disabled={workspaces.length === 0}
          />

          <Button className="w-fit" disabled={isCreating || workspaces.length === 0} type="submit">
            {isCreating ? 'Creating...' : 'Create project'}
          </Button>
        </form>

        {status === 'loading' && (
          <p className="text-sm text-muted-foreground">Loading projects...</p>
        )}

        {status === 'error' && <p className="text-sm text-destructive">{error}</p>}

        {status === 'ready' && workspaces.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Create a workspace before adding projects.
          </p>
        )}

        {status === 'ready' && workspaces.length > 0 && visibleProjects.length === 0 && (
          <p className="text-sm text-muted-foreground">No projects in this workspace yet.</p>
        )}

        {status === 'ready' && visibleProjects.length > 0 && (
          <ul className="flex flex-col gap-2">
            {visibleProjects.map((project) => (
              <li key={project.id} className="rounded-md border border-border px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="block text-sm font-medium text-foreground">
                      {project.name}
                    </strong>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {project.description || 'No description'}
                    </span>
                  </div>

                  <Badge variant="secondary">{project.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
