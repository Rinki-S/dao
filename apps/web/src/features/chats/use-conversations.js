import { createContext, useContext } from 'react';

/**
 * The conversation list and which one is open, shared by the sidebar that shows
 * it and the pane that adds to it.
 *
 * Kept apart from the provider that fills it so that the file holding the
 * provider exports nothing but a component — which is what lets an edit to it
 * refresh in place instead of reloading the window.
 */
export const ConversationsContext = createContext(null);

export function useConversations() {
  const value = useContext(ConversationsContext);

  if (!value) {
    throw new Error('useConversations must be used inside a ConversationsProvider.');
  }

  return value;
}
