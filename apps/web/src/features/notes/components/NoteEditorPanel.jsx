import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { getNote, updateNoteContent } from '../api.js';

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
  const [content, setContent] = useState('');
  const [loadStatus, setLoadStatus] = useState('idle');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [error, setError] = useState('');
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
        setContent(nextNote.content);
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
      cancelled = true;
    };
  }, [noteId]);

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
          <h2 className="mt-1 truncate font-heading text-xl font-semibold text-foreground">
            {note?.title ?? 'Untitled'}
          </h2>
        </div>
        <div className="shrink-0 text-xs text-muted-foreground">
          {getSaveStatusLabel(saveStatus)}
        </div>
      </div>

      {error && saveStatus === 'failed' && <p className="text-sm text-destructive">{error}</p>}

      <Textarea
        aria-label="Markdown note content"
        className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent p-0 font-mono text-sm leading-6 shadow-none focus-visible:ring-0"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Write markdown..."
        spellCheck={false}
      />
    </section>
  );
}
