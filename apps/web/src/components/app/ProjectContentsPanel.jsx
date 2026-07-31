import { useEffect, useMemo, useState } from 'react';
import { IconFolder } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table.jsx';
import { getContentFormatIcon } from '@/extensions/registry.js';
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

function ProjectContentsNotice({ title, description }) {
  return (
    <Card className="max-w-3xl gap-0 py-0">
      <CardContent className="p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground text-balance">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">{description}</p>
      </CardContent>
    </Card>
  );
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
      <ProjectContentsNotice
        title="No workspace selected"
        description="Create or select a workspace before browsing project content."
      />
    );
  }

  if (status === 'loading') {
    return (
      <div className="space-y-4 p-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="space-y-3">
          <div className="flex gap-4 border-b border-border pb-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-44" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!selectedProject) {
    return (
      <ProjectContentsNotice
        title="Project not found"
        description="Select another project from the sidebar."
      />
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 pl-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconFolder
            aria-hidden="true"
            className="size-[18px] shrink-0 translate-y-px"
            data-icon="inline-start"
          />
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

      <div>
        <Table aria-label="Project contents" className="min-w-full">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Name</TableHead>
              <TableHead scope="col">Type</TableHead>
              <TableHead scope="col">Source</TableHead>
              <TableHead scope="col">Updated</TableHead>
              <TableHead scope="col">Format</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contentRows.length === 0 && (
              <TableRow id="empty-project-contents">
                <TableCell colSpan={5} className="h-24 px-8 text-center text-muted-foreground">
                  Add project content from the sidebar to start building this workspace.
                </TableCell>
              </TableRow>
            )}

            {contentRows.map((row) => {
              const ContentIcon = getContentFormatIcon(row.format);

              return (
                <TableRow id={row.id} key={row.id}>
                  <TableCell className="max-w-sm">
                    <div className="flex min-w-0 items-center gap-4">
                      <ContentIcon aria-hidden="true" className="size-[18px] shrink-0" />
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
                  <TableCell className="tabular-nums">{formatUpdatedAt(row.updatedAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.format}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
