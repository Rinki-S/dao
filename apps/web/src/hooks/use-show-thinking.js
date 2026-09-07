'use client';
import { useCallback, useState } from 'react';
import { readShowThinking, writeShowThinking } from '@/lib/thinking.js';

/**
 * Owns the "show the model's working" preference for the shell.
 *
 * Mount it once, at the top, and pass the value down. Two components each
 * holding their own copy would drift the moment one of them changed it —
 * localStorage tells nobody it was written to, so the settings switch and the
 * transcript would disagree until the next reload.
 */
export function useShowThinking() {
  const [showThinking, setStoredShowThinking] = useState(readShowThinking);

  const setShowThinking = useCallback((next) => {
    const wanted = Boolean(next);
    writeShowThinking(wanted);
    setStoredShowThinking(wanted);
  }, []);

  return { showThinking, setShowThinking };
}
