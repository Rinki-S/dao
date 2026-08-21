import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { IconFileOff } from '@tabler/icons-react';

import { Skeleton } from '@/components/ui/skeleton.jsx';
import { notifyActivityChanged } from '@/features/activities/events.js';
import {
  clearPendingNoteDraft,
  enqueueNoteSave,
  getPendingNoteDraft,
  markPendingNoteDraftFailed,
  markPendingNoteDraftSaved,
  setPendingNoteDraft,
  waitForNoteSaves,
} from '@/features/notes/note-save-queue.js';
import { getNote, updateNote, updateNoteContent } from '../api.js';
import './note-editor-panel.css';

const AUTOSAVE_DELAY_MS = 800;
const MarkdownRichEditor = lazy(() =>
  import('@/features/notes/editor/MarkdownRichEditor.jsx').then((module) => ({
    default: module.MarkdownRichEditor,
  })),
);

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

function NoteEditorState({ title, description, tone = 'muted' }) {
  return (
    <section aria-label={title} className="dao-note-editor-state">
      <div className="flex max-w-sm flex-col items-center">
        <IconFileOff
          aria-hidden="true"
          className={
            tone === 'danger' ? 'mb-4 size-8 text-destructive' : 'mb-4 size-8 text-muted-foreground'
          }
        />
        <h1
          className={
            tone === 'danger'
              ? 'font-heading text-lg font-semibold text-destructive'
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

function MarkdownEditorLoadingState() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading Markdown editor"
      className="dao-note-editor-loading"
      role="status"
    >
      <div className="dao-note-editor-loading__toolbar">
        <Skeleton className="h-7 w-72 max-w-full" />
      </div>
      <div className="dao-note-editor-loading__body space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-7 h-5 w-2/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

export function NoteEditorPanel({ noteId }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loadStatus, setLoadStatus] = useState('idle');
  const [loadedNoteId, setLoadedNoteId] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [error, setError] = useState('');
  const savedTitleRef = useRef('');
  const latestTitleRef = useRef('');
  const savedContentRef = useRef('');
  const latestContentRef = useRef('');
  const latestNoteIdRef = useRef(noteId);
  const loadedNoteIdRef = useRef(null);
  const noteGenerationRef = useRef(0);
  const saveRevisionRef = useRef({ content: 0, title: 0 });
  const saveErrorsRef = useRef({ content: null, title: null });
  const pendingFieldSaveCountsRef = useRef(new Map());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    latestNoteIdRef.current = noteId;
  }, [noteId]);

  useEffect(() => {
    latestContentRef.current = content;
  }, [content]);

  useEffect(() => {
    latestTitleRef.current = title;
  }, [title]);

  const isActiveNoteGeneration = useCallback((noteIdToSave, noteGeneration) => {
    return (
      mountedRef.current &&
      latestNoteIdRef.current === noteIdToSave &&
      noteGenerationRef.current === noteGeneration
    );
  }, []);

  const hasPendingFieldSave = useCallback((noteIdToCheck, field) => {
    return (pendingFieldSaveCountsRef.current.get(`${noteIdToCheck}:${field}`) ?? 0) > 0;
  }, []);

  const updateSavePresentation = useCallback(
    (noteIdToSave, noteGeneration) => {
      if (!isActiveNoteGeneration(noteIdToSave, noteGeneration)) {
        return;
      }

      const saveError = saveErrorsRef.current.content ?? saveErrorsRef.current.title;

      if (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to save note');
        setSaveStatus('failed');
        return;
      }

      const latestTrimmedTitle = latestTitleRef.current.trim();
      const hasUnsavedTitle =
        (latestTrimmedTitle !== '' && latestTrimmedTitle !== savedTitleRef.current) ||
        hasPendingFieldSave(noteIdToSave, 'title');
      const hasUnsavedContent =
        latestContentRef.current !== savedContentRef.current ||
        hasPendingFieldSave(noteIdToSave, 'content');

      setError('');
      setSaveStatus(hasUnsavedTitle || hasUnsavedContent ? 'saving' : 'saved');
    },
    [hasPendingFieldSave, isActiveNoteGeneration],
  );

  const enqueueContentSave = useCallback(
    (noteIdToSave, contentToSave, noteGeneration) => {
      const saveRevision = ++saveRevisionRef.current.content;
      const pendingSaveKey = `${noteIdToSave}:content`;
      setPendingNoteDraft(noteIdToSave, 'content', contentToSave);

      pendingFieldSaveCountsRef.current.set(
        pendingSaveKey,
        (pendingFieldSaveCountsRef.current.get(pendingSaveKey) ?? 0) + 1,
      );

      if (isActiveNoteGeneration(noteIdToSave, noteGeneration)) {
        saveErrorsRef.current.content = null;
        updateSavePresentation(noteIdToSave, noteGeneration);
      }

      const savePromise = enqueueNoteSave(noteIdToSave, () =>
        updateNoteContent(noteIdToSave, { content: contentToSave }),
      );

      void savePromise.then(
        () => {
          markPendingNoteDraftSaved(noteIdToSave, 'content', contentToSave);

          if (!isActiveNoteGeneration(noteIdToSave, noteGeneration)) {
            return;
          }

          savedContentRef.current = contentToSave;

          if (
            saveRevision === saveRevisionRef.current.content &&
            latestContentRef.current === contentToSave
          ) {
            saveErrorsRef.current.content = null;
          }

          updateSavePresentation(noteIdToSave, noteGeneration);
        },
        (err) => {
          markPendingNoteDraftFailed(noteIdToSave, 'content', contentToSave, err);

          if (
            isActiveNoteGeneration(noteIdToSave, noteGeneration) &&
            saveRevision === saveRevisionRef.current.content &&
            latestContentRef.current === contentToSave
          ) {
            saveErrorsRef.current.content = err;
            updateSavePresentation(noteIdToSave, noteGeneration);
          }
        },
      );
      const finishTrackingSave = () => {
        const remainingSaves = (pendingFieldSaveCountsRef.current.get(pendingSaveKey) ?? 1) - 1;

        if (remainingSaves > 0) {
          pendingFieldSaveCountsRef.current.set(pendingSaveKey, remainingSaves);
        } else {
          pendingFieldSaveCountsRef.current.delete(pendingSaveKey);
        }

        updateSavePresentation(noteIdToSave, noteGeneration);
      };
      void savePromise.then(finishTrackingSave, finishTrackingSave);

      return savePromise;
    },
    [isActiveNoteGeneration, updateSavePresentation],
  );

  const enqueueMetadataSave = useCallback(
    (noteIdToSave, titleToSave, noteGeneration) => {
      const saveRevision = ++saveRevisionRef.current.title;
      const pendingSaveKey = `${noteIdToSave}:title`;
      setPendingNoteDraft(noteIdToSave, 'title', titleToSave);

      pendingFieldSaveCountsRef.current.set(
        pendingSaveKey,
        (pendingFieldSaveCountsRef.current.get(pendingSaveKey) ?? 0) + 1,
      );

      if (isActiveNoteGeneration(noteIdToSave, noteGeneration)) {
        saveErrorsRef.current.title = null;
        updateSavePresentation(noteIdToSave, noteGeneration);
      }

      const savePromise = enqueueNoteSave(noteIdToSave, () =>
        updateNote(noteIdToSave, { title: titleToSave }),
      );

      void savePromise.then(
        () => {
          markPendingNoteDraftSaved(noteIdToSave, 'title', titleToSave);
          notifyActivityChanged();

          if (!isActiveNoteGeneration(noteIdToSave, noteGeneration)) {
            return;
          }

          savedTitleRef.current = titleToSave;

          if (
            saveRevision === saveRevisionRef.current.title &&
            latestTitleRef.current.trim() === titleToSave
          ) {
            saveErrorsRef.current.title = null;
          }

          updateSavePresentation(noteIdToSave, noteGeneration);
        },
        (err) => {
          markPendingNoteDraftFailed(noteIdToSave, 'title', titleToSave, err);

          if (
            isActiveNoteGeneration(noteIdToSave, noteGeneration) &&
            saveRevision === saveRevisionRef.current.title &&
            latestTitleRef.current.trim() === titleToSave
          ) {
            saveErrorsRef.current.title = err;
            updateSavePresentation(noteIdToSave, noteGeneration);
          }
        },
      );
      const finishTrackingSave = () => {
        const remainingSaves = (pendingFieldSaveCountsRef.current.get(pendingSaveKey) ?? 1) - 1;

        if (remainingSaves > 0) {
          pendingFieldSaveCountsRef.current.set(pendingSaveKey, remainingSaves);
        } else {
          pendingFieldSaveCountsRef.current.delete(pendingSaveKey);
        }

        updateSavePresentation(noteIdToSave, noteGeneration);
      };
      void savePromise.then(finishTrackingSave, finishTrackingSave);

      return savePromise;
    },
    [isActiveNoteGeneration, updateSavePresentation],
  );

  const flushPendingSave = useCallback(
    (noteIdToSave, noteGeneration) => {
      const contentToSave = latestContentRef.current;

      if (
        !noteIdToSave ||
        loadedNoteIdRef.current !== noteIdToSave ||
        (contentToSave === savedContentRef.current && !hasPendingFieldSave(noteIdToSave, 'content'))
      ) {
        return;
      }

      void enqueueContentSave(noteIdToSave, contentToSave, noteGeneration);
    },
    [enqueueContentSave, hasPendingFieldSave],
  );

  const flushPendingMetadataSave = useCallback(
    (noteIdToSave, noteGeneration) => {
      const titleToSave = latestTitleRef.current.trim();

      if (
        !noteIdToSave ||
        loadedNoteIdRef.current !== noteIdToSave ||
        titleToSave === '' ||
        (titleToSave === savedTitleRef.current && !hasPendingFieldSave(noteIdToSave, 'title'))
      ) {
        return;
      }

      void enqueueMetadataSave(noteIdToSave, titleToSave, noteGeneration);
    },
    [enqueueMetadataSave, hasPendingFieldSave],
  );

  useEffect(() => {
    if (!noteId) {
      return;
    }

    const noteGeneration = ++noteGenerationRef.current;
    let cancelled = false;
    loadedNoteIdRef.current = null;

    async function load() {
      try {
        setLoadStatus('loading');
        setSaveStatus('idle');
        setError('');

        await waitForNoteSaves(noteId);

        if (cancelled || noteGenerationRef.current !== noteGeneration) {
          return;
        }

        const nextNote = await getNote(noteId);

        if (cancelled || noteGenerationRef.current !== noteGeneration) {
          return;
        }

        const pendingDraft = getPendingNoteDraft(noteId);
        const pendingTitle =
          pendingDraft?.title?.value === nextNote.title ? null : (pendingDraft?.title ?? null);
        const pendingContent =
          pendingDraft?.content?.value === nextNote.content
            ? null
            : (pendingDraft?.content ?? null);

        if (pendingDraft?.title && !pendingTitle) {
          clearPendingNoteDraft(noteId, 'title');
        }

        if (pendingDraft?.content && !pendingContent) {
          clearPendingNoteDraft(noteId, 'content');
        }

        const hasPendingDraft = Boolean(pendingTitle || pendingContent);
        const nextTitle = pendingTitle?.value ?? nextNote.title;
        const nextContent = pendingContent?.value ?? nextNote.content;
        const pendingSaveError = pendingContent?.error ?? pendingTitle?.error ?? null;

        loadedNoteIdRef.current = noteId;
        setLoadedNoteId(noteId);
        setTitle(nextTitle);
        setContent(nextContent);
        savedTitleRef.current = nextNote.title;
        latestTitleRef.current = nextTitle;
        savedContentRef.current = nextNote.content;
        latestContentRef.current = nextContent;
        saveErrorsRef.current = {
          content: pendingContent?.error ?? null,
          title: pendingTitle?.error ?? null,
        };
        setLoadStatus('ready');
        setSaveStatus(hasPendingDraft ? (pendingSaveError ? 'failed' : 'saving') : 'saved');
        setError(
          pendingSaveError instanceof Error
            ? pendingSaveError.message
            : pendingSaveError
              ? 'Failed to save note'
              : '',
        );
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
      flushPendingMetadataSave(noteId, noteGeneration);
      flushPendingSave(noteId, noteGeneration);
      cancelled = true;
    };
  }, [flushPendingMetadataSave, flushPendingSave, noteId]);

  useEffect(() => {
    const trimmedTitle = title.trim();

    if (
      loadStatus !== 'ready' ||
      !noteId ||
      loadedNoteIdRef.current !== noteId ||
      trimmedTitle === '' ||
      (trimmedTitle === savedTitleRef.current && !hasPendingFieldSave(noteId, 'title'))
    ) {
      return;
    }

    const titleToSave = trimmedTitle;
    const noteGeneration = noteGenerationRef.current;

    const timeoutId = window.setTimeout(() => {
      void enqueueMetadataSave(noteId, titleToSave, noteGeneration);
    }, AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [enqueueMetadataSave, hasPendingFieldSave, loadStatus, noteId, title]);

  useEffect(() => {
    if (
      loadStatus !== 'ready' ||
      !noteId ||
      loadedNoteIdRef.current !== noteId ||
      (content === savedContentRef.current && !hasPendingFieldSave(noteId, 'content'))
    ) {
      return;
    }

    const contentToSave = content;
    const noteGeneration = noteGenerationRef.current;

    const timeoutId = window.setTimeout(() => {
      void enqueueContentSave(noteId, contentToSave, noteGeneration);
    }, AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [content, enqueueContentSave, hasPendingFieldSave, loadStatus, noteId]);

  if (!noteId) {
    return (
      <NoteEditorState
        title="No note selected"
        description="Select a note from the file tree to start editing."
      />
    );
  }

  if (loadStatus === 'loading' || (loadStatus !== 'error' && loadedNoteId !== noteId)) {
    return (
      <section aria-busy="true" aria-label="Loading note" className="dao-note-editor" role="status">
        <div className="dao-note-editor-loading__toolbar">
          <Skeleton className="h-7 w-72 max-w-full" />
        </div>
        <div className="dao-note-loading-body space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="mt-7 h-5 w-2/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </section>
    );
  }

  if (loadStatus === 'error') {
    return <NoteEditorState title="Unable to load note" description={error} tone="danger" />;
  }

  const saveStatusLabel = getSaveStatusLabel(saveStatus);

  return (
    <section aria-label="Note editor" className="dao-note-editor">
      {error && saveStatus === 'failed' && (
        <p className="dao-note-save-error" role="alert">
          {error}
        </p>
      )}

      <Suspense fallback={<MarkdownEditorLoadingState />}>
        <MarkdownRichEditor
          key={noteId}
          ariaLabel="Markdown note content"
          initialMarkdown={content}
          saveStatus={saveStatus}
          saveStatusLabel={saveStatusLabel}
          onMarkdownChange={(nextMarkdown) => {
            if (loadedNoteIdRef.current !== noteId) {
              return;
            }

            latestContentRef.current = nextMarkdown;

            if (
              nextMarkdown === savedContentRef.current &&
              !hasPendingFieldSave(noteId, 'content')
            ) {
              clearPendingNoteDraft(noteId, 'content');
            } else {
              setPendingNoteDraft(noteId, 'content', nextMarkdown);
            }

            saveErrorsRef.current.content = null;
            updateSavePresentation(noteId, noteGenerationRef.current);
            setContent(nextMarkdown);
          }}
        />
      </Suspense>
    </section>
  );
}
