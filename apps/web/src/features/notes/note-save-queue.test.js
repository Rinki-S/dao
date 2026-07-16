import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingNoteDraft,
  enqueueNoteSave,
  getPendingNoteDraft,
  markPendingNoteDraftFailed,
  markPendingNoteDraftSaved,
  resetNoteSaveQueueForTests,
  setPendingNoteDraft,
  waitForAllPendingNoteSaves,
  waitForNoteSaves,
} from './note-save-queue.js';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('note save queue', () => {
  afterEach(async () => {
    await resetNoteSaveQueueForTests();
  });

  it('runs saves for the same note strictly in enqueue order', async () => {
    const firstSave = createDeferred();
    const secondSave = createDeferred();
    const starts = [];

    const firstResult = enqueueNoteSave('note-1', () => {
      starts.push('first');
      return firstSave.promise;
    });
    const secondResult = enqueueNoteSave('note-1', () => {
      starts.push('second');
      return secondSave.promise;
    });

    await flushPromises();
    expect(starts).toEqual(['first']);

    firstSave.resolve('first saved');
    await expect(firstResult).resolves.toBe('first saved');
    await flushPromises();
    expect(starts).toEqual(['first', 'second']);

    secondSave.resolve('second saved');
    await expect(secondResult).resolves.toBe('second saved');
  });

  it('allows saves for different notes to run in parallel', async () => {
    const firstSave = createDeferred();
    const secondSave = createDeferred();
    const starts = [];

    const firstResult = enqueueNoteSave('note-1', () => {
      starts.push('note-1');
      return firstSave.promise;
    });
    const secondResult = enqueueNoteSave('note-2', () => {
      starts.push('note-2');
      return secondSave.promise;
    });

    await flushPromises();
    expect(starts).toEqual(['note-1', 'note-2']);

    firstSave.resolve();
    secondSave.resolve();
    await Promise.all([firstResult, secondResult]);
  });

  it('preserves each task rejection and continues with the next save', async () => {
    const failure = new Error('disk unavailable');
    const nextTask = vi.fn(() => 'latest draft saved');

    const failedResult = enqueueNoteSave('note-1', () => {
      throw failure;
    });
    const nextResult = enqueueNoteSave('note-1', nextTask);

    await expect(failedResult).rejects.toBe(failure);
    await expect(nextResult).resolves.toBe('latest draft saved');
    expect(nextTask).toHaveBeenCalledOnce();
  });

  it('waits for the current note tail without waiting for another note', async () => {
    const firstSave = createDeferred();
    const secondSave = createDeferred();
    const otherNoteSave = createDeferred();

    enqueueNoteSave('note-1', () => firstSave.promise);
    enqueueNoteSave('note-1', () => secondSave.promise);
    const otherResult = enqueueNoteSave('note-2', () => otherNoteSave.promise);

    const wait = waitForNoteSaves('note-1');
    let waitFinished = false;
    void wait.then(() => {
      waitFinished = true;
    });

    firstSave.resolve();
    await flushPromises();
    expect(waitFinished).toBe(false);

    secondSave.resolve();
    await expect(wait).resolves.toBeUndefined();
    expect(waitFinished).toBe(true);

    otherNoteSave.resolve();
    await otherResult;
  });

  it('waits for later queued work without letting an obsolete failure block reload', async () => {
    const firstSave = createDeferred();
    const secondSave = createDeferred();
    const failure = new Error('first save failed');

    const failedResult = enqueueNoteSave('note-1', () => firstSave.promise);
    enqueueNoteSave('note-1', () => secondSave.promise);

    const wait = waitForNoteSaves('note-1');
    let waitFinished = false;
    void wait.then(() => {
      waitFinished = true;
    });

    firstSave.reject(failure);
    await expect(failedResult).rejects.toBe(failure);
    await flushPromises();
    expect(waitFinished).toBe(false);

    secondSave.resolve();
    await expect(wait).resolves.toBeUndefined();
    expect(waitFinished).toBe(true);
  });

  it('waits for all notes and exposes unresolved draft failures', async () => {
    const firstSave = createDeferred();
    const secondSave = createDeferred();
    const firstFailure = new Error('first note failed');
    const secondFailure = new Error('second note failed');

    enqueueNoteSave('note-1', () => firstSave.promise);
    enqueueNoteSave('note-2', () => secondSave.promise);
    setPendingNoteDraft('note-1', 'content', 'first draft');
    setPendingNoteDraft('note-2', 'title', 'Second title');

    const wait = waitForAllPendingNoteSaves();
    markPendingNoteDraftFailed('note-1', 'content', 'first draft', firstFailure);
    markPendingNoteDraftFailed('note-2', 'title', 'Second title', secondFailure);
    firstSave.reject(firstFailure);
    secondSave.reject(secondFailure);

    await expect(wait).rejects.toMatchObject({
      errors: [firstFailure, secondFailure],
      message: 'Multiple note saves failed',
    });
  });

  it('retains the newest draft when an older snapshot succeeds', () => {
    setPendingNoteDraft('note-1', 'content', 'first draft');
    setPendingNoteDraft('note-1', 'content', 'latest draft');

    markPendingNoteDraftSaved('note-1', 'content', 'first draft');

    expect(getPendingNoteDraft('note-1')).toEqual({
      content: { error: null, value: 'latest draft' },
    });

    markPendingNoteDraftSaved('note-1', 'content', 'latest draft');
    expect(getPendingNoteDraft('note-1')).toBeNull();
  });

  it('keeps a failed draft recoverable until it is cleared or saved', async () => {
    const failure = new Error('disk unavailable');
    setPendingNoteDraft('note-1', 'content', 'recover me');
    markPendingNoteDraftFailed('note-1', 'content', 'recover me', failure);

    expect(getPendingNoteDraft('note-1')).toEqual({
      content: { error: failure, value: 'recover me' },
    });
    await expect(waitForAllPendingNoteSaves()).rejects.toBe(failure);

    clearPendingNoteDraft('note-1', 'content');
    await expect(waitForAllPendingNoteSaves()).resolves.toBeUndefined();
  });
});
