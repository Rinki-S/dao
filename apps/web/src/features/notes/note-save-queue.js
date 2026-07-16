const noteSaveQueues = new Map();
const pendingNoteSaves = new Set();
const pendingNoteDrafts = new Map();

async function waitForPendingSaves(saves) {
  await Promise.allSettled(saves);
}

function getOrCreatePendingDraft(noteId) {
  let draft = pendingNoteDrafts.get(noteId);

  if (!draft) {
    draft = {};
    pendingNoteDrafts.set(noteId, draft);
  }

  return draft;
}

function removeEmptyPendingDraft(noteId, draft) {
  if (!draft.title && !draft.content && pendingNoteDrafts.get(noteId) === draft) {
    pendingNoteDrafts.delete(noteId);
  }
}

function getPendingDraftFailures() {
  const failures = [];

  for (const [noteId, draft] of pendingNoteDrafts) {
    for (const field of ['title', 'content']) {
      const pendingField = draft[field];

      if (!pendingField) {
        continue;
      }

      failures.push(
        pendingField.error ?? new Error(`Note ${noteId} still has unsaved ${field} changes`),
      );
    }
  }

  return failures;
}

function throwPendingDraftFailures() {
  const failures = getPendingDraftFailures();

  if (failures.length === 1) {
    throw failures[0];
  }

  if (failures.length > 1) {
    throw new AggregateError(failures, 'Multiple note saves failed');
  }
}

/**
 * Preserve the latest unsaved value outside the editor component lifecycle.
 *
 * @param {string} noteId
 * @param {'title' | 'content'} field
 * @param {string} value
 */
export function setPendingNoteDraft(noteId, field, value) {
  const draft = getOrCreatePendingDraft(noteId);
  draft[field] = { error: null, value };
}

/**
 * Clear one field when the editor returns to the durable value.
 *
 * @param {string} noteId
 * @param {'title' | 'content'} field
 */
export function clearPendingNoteDraft(noteId, field) {
  const draft = pendingNoteDrafts.get(noteId);

  if (!draft) {
    return;
  }

  delete draft[field];
  removeEmptyPendingDraft(noteId, draft);
}

/**
 * Clear a saved snapshot only when no newer draft has replaced it.
 *
 * @param {string} noteId
 * @param {'title' | 'content'} field
 * @param {string} value
 */
export function markPendingNoteDraftSaved(noteId, field, value) {
  const draft = pendingNoteDrafts.get(noteId);

  if (!draft || draft[field]?.value !== value) {
    return;
  }

  delete draft[field];
  removeEmptyPendingDraft(noteId, draft);
}

/**
 * Retain a failed snapshot only when it is still the latest draft.
 *
 * @param {string} noteId
 * @param {'title' | 'content'} field
 * @param {string} value
 * @param {unknown} error
 */
export function markPendingNoteDraftFailed(noteId, field, value, error) {
  const draft = pendingNoteDrafts.get(noteId);

  if (!draft || draft[field]?.value !== value) {
    return;
  }

  draft[field].error = error;
}

/**
 * Read the latest recoverable values for a note.
 *
 * @param {string} noteId
 * @returns {{ title?: { error: unknown, value: string }, content?: { error: unknown, value: string }} | null}
 */
export function getPendingNoteDraft(noteId) {
  const draft = pendingNoteDrafts.get(noteId);

  if (!draft) {
    return null;
  }

  return {
    ...(draft.title ? { title: { ...draft.title } } : {}),
    ...(draft.content ? { content: { ...draft.content } } : {}),
  };
}

/**
 * Queue a save for one note while allowing saves for other notes to run in parallel.
 *
 * @param {string} noteId
 * @param {() => Promise<unknown> | unknown} task
 * @returns {Promise<unknown>} The task's own result, including its rejection.
 */
export function enqueueNoteSave(noteId, task) {
  let queue = noteSaveQueues.get(noteId);

  if (!queue) {
    queue = {
      tail: Promise.resolve(),
      pending: new Set(),
    };
    noteSaveQueues.set(noteId, queue);
  }

  const save = queue.tail.then(() => task());

  queue.pending.add(save);
  pendingNoteSaves.add(save);

  // Keep the sequencing tail fulfilled so one failed request cannot block newer drafts.
  queue.tail = save.catch(() => undefined);

  const removePendingSave = () => {
    queue.pending.delete(save);
    pendingNoteSaves.delete(save);

    if (queue.pending.size === 0 && noteSaveQueues.get(noteId) === queue) {
      noteSaveQueues.delete(noteId);
    }
  };

  save.then(removePendingSave, removePendingSave);

  return save;
}

/**
 * Wait for the saves currently queued for one note.
 *
 * @param {string} noteId
 * @returns {Promise<void>}
 */
export function waitForNoteSaves(noteId) {
  const queue = noteSaveQueues.get(noteId);
  return waitForPendingSaves(queue ? [...queue.pending] : []);
}

/**
 * Wait for every save that is pending when this function is called.
 *
 * @returns {Promise<void>}
 */
export function waitForAllPendingNoteSaves() {
  return waitForPendingSaves([...pendingNoteSaves]).then(() => {
    throwPendingDraftFailures();
  });
}

export async function resetNoteSaveQueueForTests() {
  while (pendingNoteSaves.size > 0) {
    await Promise.allSettled([...pendingNoteSaves]);
  }

  noteSaveQueues.clear();
  pendingNoteDrafts.clear();
}
