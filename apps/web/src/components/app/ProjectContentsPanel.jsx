import { useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Folder01Icon from '@hugeicons/core-free-icons/Folder01Icon';
import { Chip, Surface, Table } from '@heroui/react';
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
    <Surface className="max-w-3xl rounded-xl border border-border p-6" variant="default">
      <h2 className="font-heading text-lg font-semibold text-foreground text-balance">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground text-pretty">{description}</p>
    </Surface>
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
    return <p className="text-sm text-muted-foreground">Loading project contents...</p>;
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
          <HugeiconsIcon
            icon={Folder01Icon}
            aria-hidden="true"
            className="size-[18px] shrink-0 translate-y-px"
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
        <Table>
          <Table.ScrollContainer className="w-full overflow-x-auto">
            <Table.Content aria-label="Project contents" className="w-full min-w-full">
              <Table.Header>
                <Table.Column isRowHeader>Name</Table.Column>
                <Table.Column>Type</Table.Column>
                <Table.Column>Source</Table.Column>
                <Table.Column>Updated</Table.Column>
                <Table.Column>Format</Table.Column>
              </Table.Header>
              <Table.Body>
                {contentRows.length === 0 && (
                  <Table.Row id="empty-project-contents">
                    <Table.Cell colSpan={5} className="h-24 px-8 text-center text-muted-foreground">
                      Add project content from the sidebar to start building this workspace.
                    </Table.Cell>
                  </Table.Row>
                )}

                {contentRows.map((row) => {
                  const ContentIcon = getContentFormatIcon(row.format);

                  return (
                    <Table.Row id={row.id} key={row.id}>
                      <Table.Cell className="max-w-sm">
                        <div className="flex min-w-0 items-center gap-4">
                          <ContentIcon aria-hidden="true" className="size-[18px] shrink-0" />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{row.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {row.summary}
                            </div>
                          </div>
                        </div>
                      </Table.Cell>
                      <Table.Cell>{row.type}</Table.Cell>
                      <Table.Cell>
                        <Chip size="sm" variant="soft">
                          {row.source}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell className="tabular-nums">
                        {formatUpdatedAt(row.updatedAt)}
                      </Table.Cell>
                      <Table.Cell>
                        <Chip size="sm" variant="secondary">
                          {row.format}
                        </Chip>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </div>
    </section>
  );
}
