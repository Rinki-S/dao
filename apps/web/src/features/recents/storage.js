import { z } from 'zod';

const STORAGE_KEY = 'dao.recents.v1';
const MAX_RECENTS_PER_WORKSPACE = 12;

// Notes are the only openable entity: a task is a line in a Markdown file and
// has no id to come back to.
export const RecentItemSchema = z.object({
  workspaceId: z.string().min(1),
  entityType: z.literal('note'),
  entityId: z.string().min(1),
  title: z.string().min(1),
  openedAt: z.string().datetime(),
});

const RecentListSchema = z.array(RecentItemSchema);

export function readRecents() {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) return [];
    const stored = JSON.parse(rawValue);
    if (!Array.isArray(stored)) return [];

    // Item by item rather than all at once: a stored entry the current schema
    // no longer accepts — a task from when tasks were entities — should drop
    // itself, not take every valid note with it.
    return stored
      .map((item) => RecentItemSchema.safeParse(item))
      .filter((result) => result.success)
      .map((result) => result.data);
  } catch {
    return [];
  }
}

export function writeRecents(items) {
  const parsed = RecentListSchema.parse(items);
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Storage can be unavailable in private/opaque renderer contexts. Recents
    // remain valid in memory for the active session.
  }
  return parsed;
}

export function recordRecent(items, item) {
  const nextItem = RecentItemSchema.parse({
    ...item,
    openedAt: new Date().toISOString(),
  });
  const otherItems = items.filter(
    (candidate) =>
      !(
        candidate.workspaceId === nextItem.workspaceId &&
        candidate.entityType === nextItem.entityType &&
        candidate.entityId === nextItem.entityId
      ),
  );
  const workspaceItems = [
    nextItem,
    ...otherItems.filter((item) => item.workspaceId === nextItem.workspaceId),
  ]
    .toSorted((first, second) => second.openedAt.localeCompare(first.openedAt))
    .slice(0, MAX_RECENTS_PER_WORKSPACE);
  const otherWorkspaceItems = otherItems.filter(
    (item) => item.workspaceId !== nextItem.workspaceId,
  );
  return writeRecents([...workspaceItems, ...otherWorkspaceItems]);
}

export function pruneRecents(items, entities) {
  const noteIds = new Set(entities.notes.map((note) => note.id));
  return writeRecents(items.filter((item) => noteIds.has(item.entityId)));
}

export function getWorkspaceRecents(items, workspaceId) {
  return items
    .filter((item) => item.workspaceId === workspaceId)
    .toSorted((first, second) => second.openedAt.localeCompare(first.openedAt));
}
