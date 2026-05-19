import { useMemo } from 'react';
import { useState } from 'react';
import { listWorkspaces } from '../../workspaces/api';
import { createProject, listProjects } from '../api';
import { useEffect } from 'react';

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

  async function handleCreateProject() {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setStatus('error');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="mt-6 max-w-3xl rounded-lg border border-[#E5E7EB] bg-white p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#111827]">Projects</h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            Create projects inside the selected workspace.
          </p>
        </div>

        {selectedWorkspace && (
          <span className="rounded-md border border-[#E5E7EB] px-2.5 py-1 text-xs text-[#6B7280]">
            {selectedWorkspace.name}
          </span>
        )}
      </div>

      {workspaces.length > 0 && (
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-[#6B7280]">Workspace</span>
          <select
            className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm outline-none focus:border-[#00A86B] focus:ring-3 focus:ring-[rgba(0,168,107,0.18)]"
            value={selectedWorkspaceId}
            onChange={(event) => setSelectedWorkspaceId(event.target.value)}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <form className="mb-5 grid gap-3" onSubmit={handleCreateProject}>
        <input
          className="rounded-md border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#00A86B] focus:ring-3 focus:ring-[rgba(0,168,107,0.18)]"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="Project name"
          disabled={workspaces.length === 0}
        />

        <input
          className="rounded-md border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#00A86B] focus:ring-3 focus:ring-[rgba(0,168,107,0.18)]"
          value={projectDescription}
          onChange={(event) => setProjectDescription(event.target.value)}
          placeholder="Description"
          disabled={workspaces.length === 0}
        />

        <button
          className="w-fit rounded-md bg-[#00A86B] px-4 py-2 text-sm font-medium text-white hover:bg-[#34C38F] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isCreating || workspaces.length === 0}
          type="submit"
        >
          {isCreating ? 'Creating...' : 'Create project'}
        </button>
      </form>

      {status === 'loading' && <p className="text-sm text-[#6B7280]">Loading projects...</p>}

      {status === 'error' && <p className="text-sm text-red-600">{error}</p>}

      {status === 'ready' && workspaces.length === 0 && (
        <p className="text-sm text-[#6B7280]">Create a workspace before adding projects.</p>
      )}

      {status === 'ready' && workspaces.length > 0 && visibleProjects.length === 0 && (
        <p className="text-sm text-[#6B7280]">No projects in this workspace yet.</p>
      )}

      {status === 'ready' && visibleProjects.length > 0 && (
        <ul className="grid gap-2">
          {visibleProjects.map((project) => (
            <li key={project.id} className="rounded-md border border-[#E5E7EB] px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong className="block text-sm font-medium text-[#111827]">
                    {project.name}
                  </strong>
                  <span className="mt-1 block text-sm text-[#6B7280]">
                    {project.description || 'No description'}
                  </span>
                </div>

                <span className="rounded-md bg-[#F2EFE8] px-2 py-1 text-xs text-[#6B7280]">
                  {project.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
