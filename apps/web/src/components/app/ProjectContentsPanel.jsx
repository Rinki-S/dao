import { useEffect, useMemo, useState } from 'react';
import {
  AddLink,
  Code,
  EditNote,
  Folder,
  Link,
} from '@nine-thirty-five/material-symbols-react/rounded';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { subscribeToActivityChanged } from '@/features/activities/events.js';
import { listNotes } from '@/features/notes/api.js';
import { listProjects } from '@/features/projects/api.js';

const futureContentTypes = [
  {
    id: 'github',
    label: 'GitHub',
    description: 'Repository context will appear here after the integration exists.',
    icon: Code,
  },
  {
    id: 'website',
    label: 'Website',
    description: 'Saved technical references and pages will live under the project.',
    icon: Link,
  },
  {
    id: 'leetcode',
    label: 'LeetCode',
    description: 'Problem records can be grouped with the project later.',
    icon: AddLink,
  },
];

export function ProjectContentsPanel({ currentWorkspace, selectedProjectId }) {
  const [projects, setProjects] = useState([]);
  const [notes, setNotes] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const selectedProject = useMemo(() => {
    if (!currentWorkspace || !selectedProjectId) {
      return null;
    }

    return (
      projects.find(
        (project) =>
          project.id === selectedProjectId && project.workspaceId === currentWorkspace.id,
      ) ?? null
    );
  }, [currentWorkspace, projects, selectedProjectId]);

  const projectNotes = useMemo(() => {
    if (!currentWorkspace || !selectedProject) {
      return [];
    }

    return notes.filter(
      (note) => note.workspaceId === currentWorkspace.id && note.projectId === selectedProject.id,
    );
  }, [currentWorkspace, notes, selectedProject]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectContents() {
      if (!currentWorkspace || !selectedProjectId) {
        return;
      }

      try {
        setStatus('loading');
        setError('');

        const [nextProjects, nextNotes] = await Promise.all([listProjects(), listNotes()]);

        if (cancelled) {
          return;
        }

        setProjects(nextProjects);
        setNotes(nextNotes);
        setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load project contents');
          setStatus('error');
        }
      }
    }

    void loadProjectContents();

    const unsubscribe = subscribeToActivityChanged(() => {
      void loadProjectContents();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [currentWorkspace, selectedProjectId]);

  if (!currentWorkspace) {
    return (
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>No workspace selected</CardTitle>
          <CardDescription>
            Create or select a workspace before browsing project content.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status === 'loading') {
    return <p className="text-sm text-muted-foreground">Loading project contents...</p>;
  }

  if (status === 'error') {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!selectedProject) {
    return (
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Project not found</CardTitle>
          <CardDescription>Select another project from the sidebar.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Folder aria-hidden="true" className="size-[18px] shrink-0 translate-y-px" />
          <span>{currentWorkspace.name}</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-heading text-xl font-semibold text-foreground">
              {selectedProject.name}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground text-pretty">
              {selectedProject.description || 'No description'}
            </p>
          </div>
          <Badge variant="secondary">{selectedProject.status}</Badge>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>{projectNotes.length} linked notes</CardDescription>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Ready for future project sources</CardDescription>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Project activity context is tracked locally</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {projectNotes.map((note) => (
          <Card key={note.id} size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <EditNote aria-hidden="true" className="size-[18px] shrink-0 translate-y-px" />
                <span className="truncate">{note.title}</span>
              </CardTitle>
              <CardDescription className="line-clamp-2">
                {note.content || 'No content'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Badge variant="secondary">{note.noteType}</Badge>
              <Badge variant="outline">{note.contentType}</Badge>
            </CardContent>
          </Card>
        ))}

        {projectNotes.length === 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>No notes yet</CardTitle>
              <CardDescription>
                Add project content from the sidebar to start building this workspace.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {futureContentTypes.map((contentType) => {
          const Icon = contentType.icon;

          return (
            <Card key={contentType.id} size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon aria-hidden="true" className="size-[18px] shrink-0 translate-y-px" />
                  <span>{contentType.label}</span>
                </CardTitle>
                <CardDescription>{contentType.description}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
