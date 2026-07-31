import fs from 'node:fs';
import path from 'node:path';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNote, updateNote, updateNoteContent } from '../api.js';
import {
  getPendingNoteDraft,
  resetNoteSaveQueueForTests,
  waitForNoteSaves,
} from '@/features/notes/note-save-queue.js';
import { listWorkspaces } from '@/features/workspaces/api.js';
import { NoteEditorPanel } from './NoteEditorPanel.jsx';

const noteEditorPanelPath = path.resolve(import.meta.dirname, 'NoteEditorPanel.jsx');
const noteEditorPanelStylesPath = path.resolve(import.meta.dirname, 'note-editor-panel.css');

vi.mock('../api.js', () => ({
  getNote: vi.fn(),
  updateNote: vi.fn(),
  updateNoteContent: vi.fn(),
}));

vi.mock('@/features/workspaces/api.js', () => ({
  listWorkspaces: vi.fn(),
}));

vi.mock('@/features/activities/events.js', () => ({
  notifyActivityChanged: vi.fn(),
}));

vi.mock('@/features/notes/editor/MarkdownRichEditor.jsx', () => ({
  MarkdownRichEditor: ({ initialMarkdown, onMarkdownChange, ariaLabel }) => (
    <textarea
      aria-label={ariaLabel}
      value={initialMarkdown}
      onChange={(event) => onMarkdownChange(event.target.value)}
    />
  ),
}));

function makeNote(overrides = {}) {
  return {
    id: 'note-1',
    workspaceId: 'workspace-1',
    projectId: null,
    title: 'Editor Plan',
    content: 'Initial content',
    filePath: '/tmp/dao/editor-plan.md',
    contentType: 'markdown',
    noteType: 'general',
    createdAt: '2026-05-26T00:00:00Z',
    updatedAt: '2026-05-26T00:00:00Z',
    deletedAt: null,
    version: 1,
    syncStatus: 'local',
    ...overrides,
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

describe('NoteEditorPanel', () => {
  let diskContent;

  beforeEach(() => {
    diskContent = 'Initial content';
    getNote.mockResolvedValue(makeNote());
    updateNote.mockResolvedValue(makeNote({ title: 'Updated title', version: 2 }));
    updateNoteContent.mockImplementation((_noteId, { content: nextContent }) => {
      diskContent = nextContent;
      return Promise.resolve(makeNote({ content: nextContent, version: 2 }));
    });
    listWorkspaces.mockResolvedValue([
      {
        id: 'workspace-1',
        name: 'Test Workspace',
        createdAt: '2026-05-26T00:00:00Z',
        updatedAt: '2026-05-26T00:00:00Z',
        deletedAt: null,
        version: 1,
        syncStatus: 'local',
      },
    ]);
  });

  afterEach(async () => {
    await resetNoteSaveQueueForTests();
    vi.clearAllMocks();
  });

  it('uses shadcn, Tabler, and shared corners without legacy component or radius APIs', () => {
    const source = fs.readFileSync(noteEditorPanelPath, 'utf8');
    const styles = fs.readFileSync(noteEditorPanelStylesPath, 'utf8');
    const combinedSource = `${source}\n${styles}`;

    expect(source).toContain("from '@/components/ui/skeleton.jsx'");
    expect(source).toContain("from '@tabler/icons-react'");
    expect(source).toContain("from '@/lib/corners.jsx'");
    expect(source).toContain('dataSlot="note-save-status-dot"');

    for (const token of [
      '@hero' + 'ui',
      'huge' + 'icons',
      'ra' + 'dix-ui',
      '@ra' + 'dix-ui',
      'as' + 'Child',
    ]) {
      expect(combinedSource).not.toContain(token);
    }

    expect(combinedSource).not.toMatch(
      /\brounded(?:-\[[^\]]+\]|-[a-z0-9-]+)?\b|borderRadius|border-radius/,
    );
  });

  it('loads markdown content for the selected note', async () => {
    render(<NoteEditorPanel noteId="note-1" />);

    expect(await screen.findByDisplayValue('Initial content')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Editor Plan')).toBeInTheDocument();
    const editorRegion = screen.getByRole('region', { name: 'Note editor' });
    expect(
      within(editorRegion).getByRole('navigation', { name: 'Note location' }),
    ).toBeInTheDocument();
    expect(
      within(editorRegion).getByRole('textbox', { name: 'Markdown note content' }),
    ).toBeInTheDocument();
    expect(within(editorRegion).getByRole('status')).toHaveTextContent('Saved');
    expect(getNote).toHaveBeenCalledWith('note-1');
    expect(updateNoteContent).not.toHaveBeenCalled();
  });

  it('announces the note loading state until the document is ready', async () => {
    const noteRequest = createDeferred();
    getNote.mockReturnValueOnce(noteRequest.promise);

    render(<NoteEditorPanel noteId="note-1" />);

    expect(screen.getByRole('status', { name: 'Loading note' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    noteRequest.resolve(makeNote());

    expect(await screen.findByDisplayValue('Initial content')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading note' })).not.toBeInTheDocument();
  });

  it('autosaves edited note title after a debounce', async () => {
    render(<NoteEditorPanel noteId="note-1" />);

    const titleInput = await screen.findByLabelText('Note title');
    fireEvent.change(titleInput, { target: { value: 'Updated title' } });

    expect(screen.getByText('Saving...')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(updateNote).toHaveBeenCalledWith('note-1', { title: 'Updated title' });
      },
      { timeout: 2000 },
    );
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  it('autosaves edited markdown after a debounce', async () => {
    render(<NoteEditorPanel noteId="note-1" />);

    const editor = await screen.findByLabelText('Markdown note content');
    fireEvent.change(editor, { target: { value: 'Updated content' } });

    expect(screen.getByText('Saving...')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(updateNoteContent).toHaveBeenCalledWith('note-1', { content: 'Updated content' });
      },
      { timeout: 2000 },
    );
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  it('keeps the edited markdown visible when autosave fails', async () => {
    updateNoteContent.mockRejectedValueOnce(new Error('Disk write failed'));

    render(<NoteEditorPanel noteId="note-1" />);

    const editor = await screen.findByLabelText('Markdown note content');
    fireEvent.change(editor, { target: { value: 'Draft that must survive' } });

    await waitFor(
      () => {
        expect(screen.getByText('Save failed')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Disk write failed');
    expect(screen.getByLabelText('Markdown note content')).toHaveValue('Draft that must survive');
  });

  it('flushes pending markdown changes when switching notes', async () => {
    getNote.mockImplementation((noteId) =>
      Promise.resolve(
        makeNote({
          id: noteId,
          title: noteId === 'note-1' ? 'First Note' : 'Second Note',
          content: noteId === 'note-1' ? 'First content' : 'Second content',
        }),
      ),
    );

    const { rerender } = render(<NoteEditorPanel noteId="note-1" />);

    const editor = await screen.findByLabelText('Markdown note content');
    fireEvent.change(editor, { target: { value: 'Unsaved draft' } });

    rerender(<NoteEditorPanel noteId="note-2" />);

    await waitFor(() => {
      expect(updateNoteContent).toHaveBeenCalledWith('note-1', { content: 'Unsaved draft' });
    });
    await waitForNoteSaves('note-1');
    expect(diskContent).toBe('Unsaved draft');
    expect(await screen.findByDisplayValue('Second content')).toBeInTheDocument();
    expect(updateNoteContent).not.toHaveBeenCalledWith('note-2', { content: 'Unsaved draft' });
  });

  it('never saves the previous note refs under a note that has not loaded', async () => {
    const secondNoteRequest = createDeferred();

    getNote.mockImplementation((noteId) => {
      if (noteId === 'note-2') {
        return secondNoteRequest.promise;
      }

      return Promise.resolve(
        makeNote({ id: 'note-1', title: 'First Note', content: 'First content' }),
      );
    });

    const { rerender, unmount } = render(<NoteEditorPanel noteId="note-1" />);

    fireEvent.change(await screen.findByLabelText('Markdown note content'), {
      target: { value: 'First note draft' },
    });
    fireEvent.change(screen.getByLabelText('Note title'), {
      target: { value: 'First Note Renamed' },
    });

    rerender(<NoteEditorPanel noteId="note-2" />);
    expect(screen.queryByLabelText('Markdown note content')).not.toBeInTheDocument();
    unmount();

    await waitForNoteSaves('note-1');
    secondNoteRequest.resolve(
      makeNote({ id: 'note-2', title: 'Second Note', content: 'Second content' }),
    );
    await Promise.resolve();

    expect(updateNoteContent).toHaveBeenCalledWith('note-1', { content: 'First note draft' });
    expect(updateNote).toHaveBeenCalledWith('note-1', { title: 'First Note Renamed' });
    expect(updateNoteContent).not.toHaveBeenCalledWith(
      'note-2',
      expect.objectContaining({ content: 'First note draft' }),
    );
    expect(updateNote).not.toHaveBeenCalledWith(
      'note-2',
      expect.objectContaining({ title: 'First Note Renamed' }),
    );
  });

  it('serializes a newer edit behind an in-flight save so the latest draft wins', async () => {
    const firstRequest = createDeferred();
    const startedContents = [];

    updateNoteContent.mockImplementation((_noteId, { content: nextContent }) => {
      startedContents.push(nextContent);

      if (nextContent === 'First draft') {
        return firstRequest.promise.then(() => {
          diskContent = nextContent;
          return makeNote({ content: nextContent, version: 2 });
        });
      }

      diskContent = nextContent;
      return Promise.resolve(makeNote({ content: nextContent, version: 3 }));
    });

    render(<NoteEditorPanel noteId="note-1" />);

    const editor = await screen.findByLabelText('Markdown note content');
    fireEvent.change(editor, { target: { value: 'First draft' } });

    await waitFor(
      () => {
        expect(startedContents).toEqual(['First draft']);
      },
      { timeout: 2000 },
    );

    fireEvent.change(editor, { target: { value: 'Latest draft' } });
    await new Promise((resolve) => window.setTimeout(resolve, 900));

    expect(startedContents).toEqual(['First draft']);

    firstRequest.resolve();

    await waitFor(() => {
      expect(startedContents).toEqual(['First draft', 'Latest draft']);
    });
    await waitForNoteSaves('note-1');

    expect(diskContent).toBe('Latest draft');
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('queues a compensating content save when an in-flight edit is reverted', async () => {
    const firstRequest = createDeferred();
    const startedContents = [];

    updateNoteContent.mockImplementation((_noteId, { content: nextContent }) => {
      startedContents.push(nextContent);

      if (nextContent === 'Temporary draft') {
        return firstRequest.promise.then(() => {
          diskContent = nextContent;
          return makeNote({ content: nextContent, version: 2 });
        });
      }

      diskContent = nextContent;
      return Promise.resolve(makeNote({ content: nextContent, version: 3 }));
    });

    render(<NoteEditorPanel noteId="note-1" />);

    const editor = await screen.findByLabelText('Markdown note content');
    fireEvent.change(editor, { target: { value: 'Temporary draft' } });

    await waitFor(
      () => {
        expect(startedContents).toEqual(['Temporary draft']);
      },
      { timeout: 2000 },
    );

    fireEvent.change(editor, { target: { value: 'Initial content' } });
    await new Promise((resolve) => window.setTimeout(resolve, 900));

    expect(startedContents).toEqual(['Temporary draft']);
    expect(getPendingNoteDraft('note-1')).toEqual({
      content: { error: null, value: 'Initial content' },
    });

    firstRequest.resolve();

    await waitFor(() => {
      expect(startedContents).toEqual(['Temporary draft', 'Initial content']);
    });
    await waitForNoteSaves('note-1');

    expect(diskContent).toBe('Initial content');
    expect(getPendingNoteDraft('note-1')).toBeNull();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('queues a compensating title save when an in-flight rename is reverted', async () => {
    const firstRequest = createDeferred();
    const startedTitles = [];
    let diskTitle = 'Editor Plan';

    updateNote.mockImplementation((_noteId, { title: nextTitle }) => {
      startedTitles.push(nextTitle);

      if (nextTitle === 'Temporary title') {
        return firstRequest.promise.then(() => {
          diskTitle = nextTitle;
          return makeNote({ title: nextTitle, version: 2 });
        });
      }

      diskTitle = nextTitle;
      return Promise.resolve(makeNote({ title: nextTitle, version: 3 }));
    });

    render(<NoteEditorPanel noteId="note-1" />);

    const titleInput = await screen.findByLabelText('Note title');
    fireEvent.change(titleInput, { target: { value: 'Temporary title' } });

    await waitFor(
      () => {
        expect(startedTitles).toEqual(['Temporary title']);
      },
      { timeout: 2000 },
    );

    fireEvent.change(titleInput, { target: { value: 'Editor Plan' } });
    await new Promise((resolve) => window.setTimeout(resolve, 900));

    expect(startedTitles).toEqual(['Temporary title']);
    expect(getPendingNoteDraft('note-1')).toEqual({
      title: { error: null, value: 'Editor Plan' },
    });

    firstRequest.resolve();

    await waitFor(() => {
      expect(startedTitles).toEqual(['Temporary title', 'Editor Plan']);
    });
    await waitForNoteSaves('note-1');

    expect(diskTitle).toBe('Editor Plan');
    expect(getPendingNoteDraft('note-1')).toBeNull();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('keeps a content failure visible after a later title save succeeds', async () => {
    const contentRequest = createDeferred();
    const contentFailure = new Error('Content write failed');

    updateNoteContent.mockReturnValue(contentRequest.promise);

    render(<NoteEditorPanel noteId="note-1" />);

    const editor = await screen.findByLabelText('Markdown note content');
    fireEvent.change(editor, { target: { value: 'Content that must remain pending' } });

    await waitFor(
      () => {
        expect(updateNoteContent).toHaveBeenCalledWith('note-1', {
          content: 'Content that must remain pending',
        });
      },
      { timeout: 2000 },
    );

    fireEvent.change(screen.getByLabelText('Note title'), {
      target: { value: 'Successfully renamed' },
    });
    await new Promise((resolve) => window.setTimeout(resolve, 900));

    expect(updateNote).not.toHaveBeenCalled();
    contentRequest.reject(contentFailure);

    await waitFor(() => {
      expect(updateNote).toHaveBeenCalledWith('note-1', { title: 'Successfully renamed' });
    });
    await waitForNoteSaves('note-1');

    expect(screen.getByText('Save failed')).toBeInTheDocument();
    expect(screen.getByText('Content write failed')).toBeInTheDocument();
    expect(getPendingNoteDraft('note-1')).toEqual({
      content: { error: contentFailure, value: 'Content that must remain pending' },
    });
  });

  it('flushes the latest draft when the active note editor unmounts', async () => {
    const { unmount } = render(<NoteEditorPanel noteId="note-1" />);

    const editor = await screen.findByLabelText('Markdown note content');
    fireEvent.change(editor, { target: { value: 'Draft saved on close' } });

    unmount();
    await waitForNoteSaves('note-1');

    expect(diskContent).toBe('Draft saved on close');
  });

  it('recovers and retries a draft when the unmount flush fails', async () => {
    const failedFlush = new Error('Disk unavailable during close');
    let saveAttempt = 0;

    getNote.mockImplementation(() => Promise.resolve(makeNote({ content: diskContent })));
    updateNoteContent.mockImplementation((_noteId, { content: nextContent }) => {
      saveAttempt += 1;

      if (saveAttempt === 1) {
        return Promise.reject(failedFlush);
      }

      diskContent = nextContent;
      return Promise.resolve(makeNote({ content: nextContent, version: 2 }));
    });

    const firstEditor = render(<NoteEditorPanel noteId="note-1" />);
    fireEvent.change(await screen.findByLabelText('Markdown note content'), {
      target: { value: 'Recovered after reopen' },
    });

    firstEditor.unmount();
    await waitForNoteSaves('note-1');

    expect(diskContent).toBe('Initial content');
    expect(getPendingNoteDraft('note-1')).toEqual({
      content: { error: failedFlush, value: 'Recovered after reopen' },
    });

    render(<NoteEditorPanel noteId="note-1" />);

    expect(await screen.findByDisplayValue('Recovered after reopen')).toBeInTheDocument();
    expect(screen.getByText('Save failed')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(updateNoteContent).toHaveBeenCalledTimes(2);
      },
      { timeout: 2000 },
    );
    await waitForNoteSaves('note-1');

    expect(diskContent).toBe('Recovered after reopen');
    expect(getPendingNoteDraft('note-1')).toBeNull();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('reconciles a failed response when the draft is already durable', async () => {
    const lostResponse = new Error('Connection closed after commit');

    getNote.mockImplementation(() => Promise.resolve(makeNote({ content: diskContent })));
    updateNoteContent.mockImplementation((_noteId, { content: nextContent }) => {
      diskContent = nextContent;
      return Promise.reject(lostResponse);
    });

    const firstEditor = render(<NoteEditorPanel noteId="note-1" />);
    fireEvent.change(await screen.findByLabelText('Markdown note content'), {
      target: { value: 'Committed despite the lost response' },
    });

    firstEditor.unmount();
    await waitForNoteSaves('note-1');

    expect(getPendingNoteDraft('note-1')).toEqual({
      content: { error: lostResponse, value: 'Committed despite the lost response' },
    });

    render(<NoteEditorPanel noteId="note-1" />);

    expect(
      await screen.findByDisplayValue('Committed despite the lost response'),
    ).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(getPendingNoteDraft('note-1')).toBeNull();

    await new Promise((resolve) => window.setTimeout(resolve, 900));
    expect(updateNoteContent).toHaveBeenCalledOnce();
  });

  it('flushes pending title changes when switching notes', async () => {
    getNote.mockImplementation((noteId) =>
      Promise.resolve(
        makeNote({
          id: noteId,
          title: noteId === 'note-1' ? 'First Note' : 'Second Note',
          content: noteId === 'note-1' ? 'First content' : 'Second content',
        }),
      ),
    );

    const { rerender } = render(<NoteEditorPanel noteId="note-1" />);

    const titleInput = await screen.findByLabelText('Note title');
    fireEvent.change(titleInput, { target: { value: 'Renamed Note' } });

    rerender(<NoteEditorPanel noteId="note-2" />);

    await waitFor(() => {
      expect(updateNote).toHaveBeenCalledWith('note-1', { title: 'Renamed Note' });
    });
    expect(await screen.findByDisplayValue('Second Note')).toBeInTheDocument();
  });
});
