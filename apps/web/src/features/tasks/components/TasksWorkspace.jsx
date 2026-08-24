import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.jsx';
import { Spinner } from '@/components/ui/spinner.jsx';
import { enqueueNoteSave } from '@/features/notes/note-save-queue.js';
import { getTaskDocument, updateTaskDocument } from '../api.js';
import { TaskAnnotations } from '../editor/task-annotation-extension.js';
import { TaskFolding } from '../editor/task-folding-extension.js';
import { TasksEditorToolbar } from '../editor/TasksEditorToolbar.jsx';

const AUTOSAVE_DELAY_MS = 800;
// Built once: Tiptap reads the extension list when it builds the editor, and a
// fresh array every render would rebuild it and lose the caret.
const TASK_EDITOR_EXTENSIONS = [TaskAnnotations, TaskFolding];
const MarkdownRichEditor = lazy(() =>
  import('@/features/notes/editor/MarkdownRichEditor.jsx').then((module) => ({
    default: module.MarkdownRichEditor,
  })),
);

function saveStatusLabelFor(status) {
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

/**
 * The task list is a Markdown file, edited the way a note is. Everything a task
 * carries lives in the text: a checkbox for done, indentation for subtasks,
 * `@due(2026-08-25)` for a date and `!high` for a priority.
 */
export function TasksWorkspace({ model }) {
  const workspaceId = model.currentWorkspace?.id ?? '';
  const [content, setContent] = useState('');
  // 'loading' from the start: the effect that reads the file runs before the
  // first paint anyone sees, so there is no idle state to render.
  const [loadStatus, setLoadStatus] = useState('loading');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [error, setError] = useState('');
  const latestContentRef = useRef('');
  const savedContentRef = useRef('');
  const timerRef = useRef(null);

  useEffect(() => {
    if (!workspaceId) return undefined;

    let active = true;

    getTaskDocument(workspaceId)
      .then((document) => {
        if (!active) return;
        latestContentRef.current = document.content;
        savedContentRef.current = document.content;
        setContent(document.content);
        setLoadStatus('ready');
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to read tasks');
        setLoadStatus('failed');
      });

    return () => {
      active = false;
    };
  }, [workspaceId]);

  // A pending edit must not be lost to a workspace switch or an unmount, so the
  // timer is flushed rather than simply cleared.
  useEffect(() => {
    return () => {
      if (timerRef.current === null) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      if (latestContentRef.current !== savedContentRef.current) {
        void save(workspaceId, latestContentRef.current);
      }
    };

    function save(id, next) {
      savedContentRef.current = next;
      return enqueueNoteSave(`tasks:${id}`, () => updateTaskDocument(id, { content: next }));
    }
  }, [workspaceId]);

  function scheduleSave(next) {
    latestContentRef.current = next;

    if (timerRef.current !== null) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      timerRef.current = null;

      if (latestContentRef.current === savedContentRef.current) return;

      const pending = latestContentRef.current;
      setSaveStatus('saving');

      // Queued rather than fired directly, so two edits in flight cannot land
      // out of order and leave the file behind the editor.
      void enqueueNoteSave(`tasks:${workspaceId}`, () =>
        updateTaskDocument(workspaceId, { content: pending })
          .then(() => {
            savedContentRef.current = pending;
            setSaveStatus('saved');
            setError('');
          })
          .catch((saveError) => {
            setSaveStatus('failed');
            setError(saveError instanceof Error ? saveError.message : 'Failed to save tasks');
          }),
      );
    }, AUTOSAVE_DELAY_MS);
  }

  if (loadStatus === 'failed') {
    return (
      <Empty role="alert">
        <EmptyHeader>
          <EmptyTitle>Unable to open Tasks</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (loadStatus !== 'ready') {
    return (
      <Empty aria-busy="true" aria-label="Loading tasks" role="status">
        <EmptyHeader>
          <EmptyMedia>
            <Spinner aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Opening your tasks…</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <section aria-label="Tasks" className="flex h-full min-h-0 flex-col overflow-hidden">
      {error && saveStatus === 'failed' && (
        <p className="bg-destructive/8 p-2 text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <Suspense
        fallback={
          <Empty aria-busy="true" aria-label="Loading editor" role="status">
            <EmptyHeader>
              <Spinner aria-hidden="true" />
              <EmptyTitle>Loading editor…</EmptyTitle>
            </EmptyHeader>
          </Empty>
        }
      >
        <MarkdownRichEditor
          key={workspaceId}
          ariaLabel="Task list"
          extraExtensions={TASK_EDITOR_EXTENSIONS}
          initialMarkdown={content}
          placeholder="Add a task…"
          renderToolbar={(props) => <TasksEditorToolbar {...props} />}
          saveStatus={saveStatus}
          saveStatusLabel={saveStatusLabelFor(saveStatus)}
          onMarkdownChange={scheduleSave}
        />
      </Suspense>
    </section>
  );
}
