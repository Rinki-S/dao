import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { notifyActivityChanged } from '@/features/activities/events.js';
import { getNote, updateNote, updateNoteContent } from '../api.js';
import { MarkdownEditor } from './MarkdownEditor.jsx';

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

export function NoteEditorPanel({ noteId }) {
  const [note, setNote] = useState(null);
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
      <section className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        Select a note from the file tree.
      </section>
    );
  }

  if (loadStatus === 'loading') {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading note...
      </section>
    );
  }

  if (loadStatus === 'error') {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center text-sm text-destructive">
        {error}
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{note?.filePath}</p>
          <Input
            aria-label="Note title"
            className="mt-1 h-auto rounded-none border-0 bg-transparent p-0 font-heading text-xl font-semibold text-foreground shadow-none focus-visible:ring-0"
            value={title}
            onChange={(event) => {
              latestTitleRef.current = event.target.value;
              setTitle(event.target.value);
            }}
            placeholder="Untitled"
          />
        </div>
        <div className="shrink-0 text-xs text-muted-foreground">
          {getSaveStatusLabel(saveStatus)}
        </div>
      </div>

      {error && saveStatus === 'failed' && <p className="text-sm text-destructive">{error}</p>}

      <MarkdownEditor
        value={content}
        onChange={(nextContent) => {
          latestContentRef.current = nextContent;
          setContent(nextContent);
        }}
        placeholder="Write markdown..."
      />
    </section>
  );
}
