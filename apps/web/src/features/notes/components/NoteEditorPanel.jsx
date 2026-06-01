import { useCallback, useEffect, useRef, useState } from 'react';
import { Chip, Skeleton } from '@heroui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import FileEmpty01Icon from '@hugeicons/core-free-icons/FileEmpty01Icon';

import { notifyActivityChanged } from '@/features/activities/events.js';
import { listProjects } from '@/features/projects/api.js';
import { listWorkspaces } from '@/features/workspaces/api.js';
import { getNote, updateNote, updateNoteContent } from '../api.js';

const AUTOSAVE_DELAY_MS = 800;

function getSaveStatusLabel(status) {
  switch (status) {
    case 'saving':
      return 'Saving...';
    case 'saved':
      return 'Saved';
    case 'failed':
      return 'Save failed';
    default:
      return '';
  }
}

function getSaveStatusVariant(status) {
  return status === 'failed' ? 'danger' : 'soft';
}

function NoteEditorState({ title, description, tone = 'muted' }) {
  return (
    <section className="flex min-h-0 flex-1 items-center justify-center px-8 py-7 text-center">
      <div className="flex max-w-sm flex-col items-center">
        <HugeiconsIcon
          icon={FileEmpty01Icon}
          aria-hidden="true"
          className={tone === 'danger' ? 'mb-4 size-8 text-danger' : 'mb-4 size-8 text-muted'}
        />
        <h1
          className={
            tone === 'danger'
              ? 'font-heading text-lg font-semibold text-danger'
              : 'font-heading text-lg font-semibold text-muted-foreground'
          }
        >
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">{description}</p>
      </div>
    </section>
  );
}

export function NoteEditorPanel({ noteId }) {
  const [_note, setNote] = useState(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loadStatus, setLoadStatus] = useState('idle');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [error, setError] = useState('');
  const savedTitleRef = useRef('');
  const latestTitleRef = useRef('');
  const savedContentRef = useRef('');
  const latestContentRef = useRef('');
  const latestNoteIdRef = useRef(noteId);

  useEffect(() => {
    latestNoteIdRef.current = noteId;
  }, [noteId]);

  useEffect(() => {
    latestContentRef.current = content;
  }, [content]);

  useEffect(() => {
    latestTitleRef.current = title;
  }, [title]);

  const flushPendingSave = useCallback((noteIdToSave) => {
    const contentToSave = latestContentRef.current;

    if (!noteIdToSave || contentToSave === savedContentRef.current) {
      return;
    }

    void updateNoteContent(noteIdToSave, { content: contentToSave }).catch(() => {});
  }, []);

  const flushPendingMetadataSave = useCallback((noteIdToSave) => {
    const titleToSave = latestTitleRef.current.trim();

    if (!noteIdToSave || titleToSave === '' || titleToSave === savedTitleRef.current) {
      return;
    }

    void updateNote(noteIdToSave, { title: titleToSave })
      .then(() => {
        notifyActivityChanged();
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!noteId) {
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setLoadStatus('loading');
        setSaveStatus('idle');
        setError('');

        const nextNote = await getNote(noteId);

        if (cancelled) {
          return;
        }

        setNote(nextNote);
        setTitle(nextNote.title);
        setContent(nextNote.content);
        savedTitleRef.current = nextNote.title;
        latestTitleRef.current = nextNote.title;
        savedContentRef.current = nextNote.content;
        latestContentRef.current = nextNote.content;
        setLoadStatus('ready');
        setSaveStatus('saved');

        const workspaces = await listWorkspaces();
        if (!cancelled) {
          const workspace = workspaces.find((w) => w.id === nextNote.workspaceId);
          setWorkspaceName(workspace?.name ?? '');
        }

        if (nextNote.projectId) {
          const projects = await listProjects();
          if (!cancelled) {
            const project = projects.find((p) => p.id === nextNote.projectId);
            setProjectName(project?.name ?? '');
          }
        } else {
          setProjectName('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load note');
          setLoadStatus('error');
          setSaveStatus('idle');
        }
      }
    }

    load();

    return () => {
      flushPendingMetadataSave(noteId);
      flushPendingSave(noteId);
      cancelled = true;
    };
  }, [flushPendingMetadataSave, flushPendingSave, noteId]);

  useEffect(() => {
    const trimmedTitle = title.trim();

    if (
      loadStatus !== 'ready' ||
      !noteId ||
      trimmedTitle === '' ||
      trimmedTitle === savedTitleRef.current
    ) {
      return;
    }

    let cancelled = false;
    const titleToSave = trimmedTitle;

    setSaveStatus('saving');
    setError('');

    const timeoutId = window.setTimeout(async () => {
      try {
        const updatedNote = await updateNote(noteId, { title: titleToSave });

        if (cancelled || latestNoteIdRef.current !== noteId) {
          return;
        }

        savedTitleRef.current = titleToSave;
        setNote({
          ...updatedNote,
          title: latestTitleRef.current,
          content: latestContentRef.current,
        });
        setSaveStatus(latestTitleRef.current.trim() === titleToSave ? 'saved' : 'saving');
        notifyActivityChanged();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to save note');
          setSaveStatus('failed');
        }
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [loadStatus, noteId, title]);

  useEffect(() => {
    if (loadStatus !== 'ready' || !noteId || content === savedContentRef.current) {
      return;
    }

    let cancelled = false;
    const contentToSave = content;

    setSaveStatus('saving');
    setError('');

    const timeoutId = window.setTimeout(async () => {
      try {
        const updatedNote = await updateNoteContent(noteId, { content: contentToSave });

        if (cancelled || latestNoteIdRef.current !== noteId) {
          return;
        }

        savedContentRef.current = contentToSave;
        setNote({ ...updatedNote, content: latestContentRef.current });
        setSaveStatus(latestContentRef.current === contentToSave ? 'saved' : 'saving');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to save note');
          setSaveStatus('failed');
        }
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [content, loadStatus, noteId]);

  if (!noteId) {
    return (
      <NoteEditorState
        title="No note selected"
        description="Select a note from the file tree to start editing."
      />
    );
  }

  if (loadStatus === 'loading') {
    return (
      <section className="flex min-h-0 flex-1 flex-col gap-6">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border pb-5">
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-3 w-48 rounded" />
            <Skeleton className="h-6 w-64 rounded" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-4/5 rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
        </div>
      </section>
    );
  }

  if (loadStatus === 'error') {
    return <NoteEditorState title="Unable to load note" description={error} tone="danger" />;
  }

  const saveStatusLabel = getSaveStatusLabel(saveStatus);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0 flex-1">
          <nav aria-label="Note location" className="text-xs">
            <ol className="flex items-center gap-1.5">
              {workspaceName && (
                <>
                  <li className="pointer-events-none text-muted">{workspaceName}</li>
                  <li aria-hidden="true" className="text-muted">
                    /
                  </li>
                </>
              )}
              {projectName && (
                <>
                  <li className="pointer-events-none text-muted">{projectName}</li>
                  <li aria-hidden="true" className="text-muted">
                    /
                  </li>
                </>
              )}
              <li className="pointer-events-none text-foreground">{title || 'Untitled'}</li>
            </ol>
          </nav>
          <input
            type="text"
            aria-label="Note title"
            className="w-full border-0 bg-transparent p-0 font-heading text-xl font-semibold text-foreground outline-none placeholder:text-muted"
            value={title}
            onChange={(event) => {
              latestTitleRef.current = event.target.value;
              setTitle(event.target.value);
            }}
            placeholder="Untitled"
          />
        </div>
        {saveStatusLabel && (
          <Chip
            className="shrink-0"
            size="sm"
            variant={getSaveStatusVariant(saveStatus)}
            aria-live="polite"
          >
            {saveStatusLabel}
          </Chip>
        )}
      </div>

      {error && saveStatus === 'failed' && <p className="text-sm text-danger">{error}</p>}

      <textarea
        aria-label="Markdown note content"
        className="min-h-0 w-full flex-1 resize-none border-0 bg-transparent p-0 font-mono text-sm leading-6 text-foreground outline-none placeholder:text-muted"
        value={content}
        onChange={(event) => {
          latestContentRef.current = event.target.value;
          setContent(event.target.value);
        }}
        placeholder="Write markdown..."
        spellCheck={false}
      />
    </section>
  );
}
