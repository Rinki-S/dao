import { useEffect, useMemo, useState } from 'react';
import { Button, Chip, Input, Label, Surface, TextField } from '@heroui/react';
import { notifyActivityChanged } from '../../activities/events.js';
import { createProject, listProjects } from '../api.js';

export function ProjectPanel({ currentWorkspace }) {
  const [projects, setProjects] = useState([]);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const visibleProjects = useMemo(() => {
    if (!currentWorkspace) {
      return [];
    }

    return projects.filter((project) => project.workspaceId === currentWorkspace.id);
  }, [projects, currentWorkspace]);

  async function loadProjectData() {
    setStatus('loading');
    setError('');

    const nextProjects = await listProjects();

    setProjects(nextProjects);
    setStatus('ready');
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setStatus('loading');
        setError('');

        const nextProjects = await listProjects();

        if (cancelled) {
          return;
        }

        setProjects(nextProjects);
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

    if (!currentWorkspace) {
      setError('Create a workspace before adding projects');
      return;
    }

    try {
      setIsCreating(true);
      setError('');

      await createProject({
        workspaceId: currentWorkspace.id,
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
    <section id="projects" className="flex max-w-3xl flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-semibold text-foreground text-balance">
            Projects
          </h2>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Create projects inside the selected workspace.
          </p>
        </div>
        {currentWorkspace && (
          <Chip className="max-w-56 shrink-0 truncate" size="sm" variant="secondary">
            {currentWorkspace.name}
          </Chip>
        )}
      </header>

      <div className="flex flex-col gap-5">
        <form className="flex flex-col gap-3" onSubmit={handleCreateProject}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <TextField
              className="min-w-0"
              isDisabled={!currentWorkspace}
              name="project-name"
              value={projectName}
              variant="secondary"
              onChange={setProjectName}
            >
              <Label className="sr-only">Project name</Label>
              <Input
                data-command-target="project-name"
                placeholder="Project name"
                variant="secondary"
              />
            </TextField>

            <TextField
              className="min-w-0"
              isDisabled={!currentWorkspace}
              name="project-description"
              value={projectDescription}
              variant="secondary"
              onChange={setProjectDescription}
            >
              <Label className="sr-only">Description</Label>
              <Input placeholder="Description" variant="secondary" />
            </TextField>

            <Button
              className="w-fit"
              isDisabled={isCreating || !currentWorkspace}
              isPending={isCreating}
              type="submit"
            >
              {isCreating ? 'Creating...' : 'Create project'}
            </Button>
          </div>
        </form>

        {status === 'loading' && (
          <p className="text-sm text-muted-foreground">Loading projects...</p>
        )}

        {status === 'error' && <p className="text-sm text-destructive">{error}</p>}

        {status === 'ready' && !currentWorkspace && (
          <p className="text-sm text-muted-foreground">
            Create a workspace before adding projects.
          </p>
        )}

        {status === 'ready' && currentWorkspace && visibleProjects.length === 0 && (
          <p className="text-sm text-muted-foreground">No projects in this workspace yet.</p>
        )}

        {status === 'ready' && visibleProjects.length > 0 && (
          <ul className="flex flex-col gap-2">
            {visibleProjects.map((project) => (
              <li key={project.id}>
                <Surface className="rounded-xl border border-border px-4 py-3" variant="default">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block text-sm font-medium text-foreground">
                        {project.name}
                      </strong>
                      <span className="mt-1 block truncate text-sm text-muted-foreground">
                        {project.description || 'No description'}
                      </span>
                    </div>

                    <Chip className="shrink-0" size="sm" variant="soft">
                      {project.status}
                    </Chip>
                  </div>
                </Surface>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
