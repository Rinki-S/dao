import { useCallback, useEffect, useMemo, useState } from 'react';

import { deleteConversation, listConversations, renameConversation } from '../api.js';
import { ConversationsContext } from '../use-conversations.js';

/**
 * The conversation list and which one is open.
 *
 * Held above both the sidebar and the chat pane because they are siblings: the
 * sidebar shows the list and decides what is open, the pane shows what is open
 * and adds to the list every time a turn creates or retitles a conversation.
 * Neither can own state the other writes to.
 *
 * The transcript stays in the pane. It is the one thing nothing else reads, and
 * lifting it here would put a half-streamed reply in a context that re-renders
 * the sidebar on every delta.
 */
export function ConversationsProvider({ model, children }) {
  const workspaceId = model.currentWorkspace?.id ?? '';
  const { revealedChatId, setRevealedChatId } = model;

  // Both of these carry the workspace they were read for, so switching
  // workspaces changes what they mean instead of needing an effect to go and
  // clear them. It also removes the flash of the previous workspace's
  // conversations that a plain list would show while the new one loads — a list
  // belonging to a workspace you have left is not "loading", it is wrong.
  const [loaded, setLoaded] = useState({ workspaceId: '', items: [] });
  const [selection, setSelection] = useState({ workspaceId: '', id: null });

  const conversations = useMemo(
    () => (loaded.workspaceId === workspaceId ? loaded.items : []),
    [loaded, workspaceId],
  );

  // A search hit asks for a conversation by naming it rather than by selecting
  // it, and it wins until something else is chosen. Derived rather than copied
  // into state by an effect: the request is already the answer, and an effect
  // that assigned it afterwards would be a second render deciding what the
  // first should have.
  const selectedId =
    revealedChatId || (selection.workspaceId === workspaceId ? selection.id : null);

  useEffect(() => {
    if (!workspaceId) return undefined;

    let cancelled = false;

    listConversations(workspaceId)
      .then((items) => {
        if (!cancelled) setLoaded({ workspaceId, items });
      })
      .catch(() => {
        // A list that cannot be read is an empty list rather than a broken
        // sidebar. The pane says what went wrong when a turn is actually sent.
        if (!cancelled) setLoaded({ workspaceId, items: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Re-read on demand, for the pane: a turn can create a conversation, give it
  // its title, and change the order of the list, and none of that is something
  // the list can work out for itself.
  const refresh = useCallback(async () => {
    if (!workspaceId) return;

    try {
      setLoaded({ workspaceId, items: await listConversations(workspaceId) });
    } catch {
      setLoaded({ workspaceId, items: [] });
    }
  }, [workspaceId]);

  const select = useCallback(
    (id) => {
      // Whatever a search asked for, the reader has moved on from it.
      setRevealedChatId('');
      setSelection({ workspaceId, id });
    },
    [setRevealedChatId, workspaceId],
  );

  const startNew = useCallback(() => {
    // A new chat is the absence of a selected one. Nothing is created until
    // there is something to say, so the list only ever holds conversations with
    // a turn in them.
    select(null);
  }, [select]);

  const rename = useCallback(async (conversation, title) => {
    const updated = await renameConversation(conversation.id, title);
    setLoaded((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === updated.id ? updated : item)),
    }));
  }, []);

  const remove = useCallback(
    async (conversation) => {
      await deleteConversation(conversation.id);
      setLoaded((current) => ({
        ...current,
        items: current.items.filter((item) => item.id !== conversation.id),
      }));

      // Deleting the open one leaves the pane on a new chat. Deleting any other
      // leaves it where it is.
      if (conversation.id === selectedId) select(null);
    },
    [select, selectedId],
  );

  const value = useMemo(
    () => ({
      conversations,
      selectedId,
      selected: conversations.find((item) => item.id === selectedId) ?? null,
      workspaceId,
      select,
      startNew,
      refresh,
      rename,
      remove,
    }),
    [conversations, selectedId, workspaceId, select, startNew, refresh, rename, remove],
  );

  return <ConversationsContext.Provider value={value}>{children}</ConversationsContext.Provider>;
}
