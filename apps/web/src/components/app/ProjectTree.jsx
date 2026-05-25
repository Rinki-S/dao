import { useEffect, useMemo, useState } from 'react';
import { EditNote, Folder, FolderOpen } from '@nine-thirty-five/material-symbols-react/rounded';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { subscribeToActivityChanged } from '@/features/activities/events.js';
import { listNotes } from '@/features/notes/api.js';
import { listProjects } from '@/features/projects/api.js';

export function ProjectTree({ currentWorkspace }) {
  const [projects, setProjects] = useState([]);
  const [notes, setNotes] = useState([]);
  const [expandedProjectIds, setExpandedProjectIds] = useState(() => new Set());
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const workspaceProjects = useMemo(() => {
    if (!currentWorkspace) {
      return [];
    }

    return projects.filter((project) => project.workspaceId === currentWorkspace.id);
  }, [currentWorkspace, projects]);

  const notesByProjectId = useMemo(() => {
    const nextNotesByProjectId = new Map();

    if (!currentWorkspace) {
      return nextNotesByProjectId;
    }

    for (const note of notes) {
      if (note.workspaceId !== currentWorkspace.id || !note.projectId) {
        continue;
      }

      const projectNotes = nextNotesByProjectId.get(note.projectId) ?? [];
      projectNotes.push(note);
      nextNotesByProjectId.set(note.projectId, projectNotes);
    }

    return nextNotesByProjectId;
  }, [currentWorkspace, notes]);

  useEffect(() => {
    let cancelled = false;

    async function loadTreeData() {
      if (!currentWorkspace) {
        setProjects([]);
        setNotes([]);
        setStatus('idle');
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
          setError(err instanceof Error ? err.message : 'Failed to load project tree');
          setStatus('error');
        }
      }
    }

    loadTreeData();

    const unsubscribe = subscribeToActivityChanged(loadTreeData);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [currentWorkspace]);

  function toggleProject(projectId) {
    setExpandedProjectIds((currentProjectIds) => {
      const nextProjectIds = new Set(currentProjectIds);

      if (nextProjectIds.has(projectId)) {
        nextProjectIds.delete(projectId);
      } else {
        nextProjectIds.add(projectId);
      }

      return nextProjectIds;
    });
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {status === 'loading' && (
            <SidebarMenuItem>
              <span className="block px-2 py-1 text-xs text-muted-foreground">Loading...</span>
            </SidebarMenuItem>
          )}

          {status === 'error' && (
            <SidebarMenuItem>
              <span className="block px-2 py-1 text-xs text-destructive">{error}</span>
            </SidebarMenuItem>
          )}

          {status === 'ready' && workspaceProjects.length === 0 && (
            <SidebarMenuItem>
              <span className="block px-2 py-1 text-xs text-muted-foreground">No projects</span>
            </SidebarMenuItem>
          )}

          {workspaceProjects.map((project) => {
            const isExpanded = expandedProjectIds.has(project.id);
            const projectNotes = notesByProjectId.get(project.id) ?? [];
            const ProjectIcon = isExpanded ? FolderOpen : Folder;

            return (
              <SidebarMenuItem key={project.id}>
                <SidebarMenuButton
                  className="app-no-drag"
                  tooltip={project.name}
                  onClick={() => toggleProject(project.id)}
                >
                  <ProjectIcon aria-hidden="true" className="size-[18px] shrink-0 translate-y-px" />
                  <span>{project.name}</span>
                </SidebarMenuButton>

                {isExpanded && (
                  <SidebarMenuSub>
                    {projectNotes.length === 0 && (
                      <SidebarMenuSubItem>
                        <span className="block px-2 py-1 text-xs text-muted-foreground">
                          No notes
                        </span>
                      </SidebarMenuSubItem>
                    )}

                    {projectNotes.map((note) => (
                      <SidebarMenuSubItem key={note.id}>
                        <SidebarMenuSubButton className="app-no-drag" asChild>
                          <button type="button">
                            <EditNote
                              aria-hidden="true"
                              className="size-[18px] shrink-0 translate-y-px"
                            />
                            <span>{note.title}</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
