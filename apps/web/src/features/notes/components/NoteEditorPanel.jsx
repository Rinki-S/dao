import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty.jsx';
import { Spinner } from '@/components/ui/spinner.jsx';
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
import { Button } from '@/components/ui/button.jsx';
import { watchWorkspace } from '@/lib/workspace-events.js';
import { getNote, NoteConflictError, updateNote, updateNoteContent } from '../api.js';

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

function NoteEditorState({ title, description }) {
  return (
    <Empty aria-label={title}>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function MarkdownEditorLoadingState() {
  return (
    <Empty aria-busy="true" aria-label="Loading Markdown editor" role="status">
      <EmptyHeader>
        <Spinner aria-hidden="true" />
        <EmptyTitle>Loading editor…</EmptyTitle>
      </EmptyHeader>
    </Empty>
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
  // What the note said when this editor read it. Sent with every save so the
  // service can refuse one that would write over somebody else's edit.
  const readAtRef = useRef('');
  const [conflict, setConflict] = useState(null);
  const [showingTheirs, setShowingTheirs] = useState(false);
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

      const savePromise = enqueueNoteSave(noteIdToSave, async () => {
        const saved = await updateNoteContent(noteIdToSave, {
          content: contentToSave,
          expectedUpdatedAt: readAtRef.current,
        });
        // The save moved the note on, so the next one has to expect where it
        // is now rather than where it was when the editor opened it.
        readAtRef.current = saved.updatedAt;

        return saved;
      });

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
          // A refused save is not a failed one: nothing is wrong, the file
          // moved on. Held rather than reported, so the choice below can be
          // offered instead of an error nobody can act on.
          if (err instanceof NoteConflictError) {
            markPendingNoteDraftSaved(noteIdToSave, 'content', contentToSave);

            if (isActiveNoteGeneration(noteIdToSave, noteGeneration)) {
              setConflict({ mine: contentToSave, theirs: err.onDisk, note: err.note });
              setShowingTheirs(false);
            }

            return;
          }

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
        readAtRef.current = nextNote.updatedAt;
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

  // A note edited somewhere else, with nothing unsaved here, is not a conflict —
  // it is news. The editor takes the new text rather than sitting on a copy that
  // is already wrong and would overwrite it on the next keystroke.
  //
  // Only when clean. Replacing text somebody is in the middle of typing would be
  // the same data loss from the other direction, and that case is the conflict
  // above, reached when they next save.
  useEffect(() => {
    return watchWorkspace(async () => {
      const id = latestNoteIdRef.current;
      if (!id || latestContentRef.current !== savedContentRef.current) return;

      const fresh = await getNote(id).catch(() => null);
      if (!fresh || fresh.id !== latestNoteIdRef.current) return;
      if (fresh.updatedAt === readAtRef.current || fresh.content === savedContentRef.current)
        return;
      if (latestContentRef.current !== savedContentRef.current) return;

      noteGenerationRef.current += 1;
      setContent(fresh.content);
      setTitle(fresh.title);
      savedContentRef.current = fresh.content;
      latestContentRef.current = fresh.content;
      savedTitleRef.current = fresh.title;
      latestTitleRef.current = fresh.title;
      readAtRef.current = fresh.updatedAt;
    });
  }, []);

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
      <Empty aria-busy="true" aria-label="Loading note" role="status">
        <EmptyHeader>
          <Spinner aria-hidden="true" />
          <EmptyTitle>Loading note…</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  if (loadStatus === 'error') {
    return <NoteEditorState title="Unable to load note" description={error} />;
  }

  // Keeping mine means writing over theirs on purpose, which is what an empty
  // expectation says to the service.
  async function keepMine() {
    const mine = conflict.mine;
    setConflict(null);

    const saved = await updateNoteContent(noteId, { content: mine, expectedUpdatedAt: '' });
    readAtRef.current = saved.updatedAt;
    savedContentRef.current = mine;
  }

  // Taking theirs discards what was typed here. The editor is remounted on the
  // new text rather than told to change under the cursor, which is why the
  // generation is bumped.
  function takeTheirs() {
    const theirs = conflict.theirs;
    setConflict(null);
    noteGenerationRef.current += 1;
    setContent(theirs);
    savedContentRef.current = theirs;
    latestContentRef.current = theirs;
    readAtRef.current = conflict.note.updatedAt;
  }

  const saveStatusLabel = getSaveStatusLabel(saveStatus);

  return (
    <section aria-label="Note editor" className="flex h-full min-h-0 flex-col overflow-hidden">
      {error && saveStatus === 'failed' && !conflict && (
        <p className="bg-destructive/8 p-2 text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {/* Not an error's colour. Nothing went wrong — two people wrote to one
          file, and the only thing missing is a decision. */}
      {conflict && (
        <div className="flex flex-col gap-2 border-b bg-warning/8 p-3 text-sm" role="alert">
          <p className="font-medium">This note changed on disk</p>
          <p className="text-muted-foreground">
            Something else edited this file while you were writing. Nothing has been saved.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void keepMine()}>
              Keep mine
            </Button>
            <Button size="sm" variant="outline" onClick={takeTheirs}>
              Take theirs
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowingTheirs((open) => !open)}>
              {showingTheirs ? 'Hide the other version' : 'Show both'}
            </Button>
          </div>
          {showingTheirs && (
            <pre className="max-h-64 overflow-auto rounded-md border bg-secondary p-3 font-mono text-xs">
              {conflict.theirs}
            </pre>
          )}
        </div>
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
