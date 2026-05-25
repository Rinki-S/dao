import { useEffect, useMemo, useState } from 'react';
import { EditNote, Folder } from '@nine-thirty-five/material-symbols-react/rounded';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { subscribeToActivityChanged } from '@/features/activities/events.js';
import { listNotes } from '@/features/notes/api.js';
import { listProjects } from '@/features/projects/api.js';

function formatUpdatedAt(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

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

  const contentRows = useMemo(() => {
    return projectNotes.map((note) => ({
      id: note.id,
      name: note.title,
      summary: note.content || 'No content',
      type: 'Note',
      source: note.noteType,
      format: note.contentType,
      updatedAt: note.updatedAt,
    }));
  }, [projectNotes]);

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
        <div className="min-w-0">
          <h2 className="truncate font-heading text-xl font-semibold text-foreground">
            {selectedProject.name}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground text-pretty">
            {selectedProject.description || 'No description'}
          </p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead>Format</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contentRows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                Add project content from the sidebar to start building this workspace.
              </TableCell>
            </TableRow>
          )}

          {contentRows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="max-w-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <EditNote aria-hidden="true" className="size-[18px] shrink-0 translate-y-px" />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{row.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{row.summary}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>{row.type}</TableCell>
              <TableCell>
                <Badge variant="secondary">{row.source}</Badge>
              </TableCell>
              <TableCell>{formatUpdatedAt(row.updatedAt)}</TableCell>
              <TableCell>
                <Badge variant="outline">{row.format}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
