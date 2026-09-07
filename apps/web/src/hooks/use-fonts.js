'use client';
import { useCallback, useEffect, useState } from 'react';
import { applyFonts, readFonts, writeFonts } from '@/lib/fonts.js';

/**
 * Owns the three font choices for the shell.
 *
 * Mount it once, at the top, the way the appearance is. The effect re-applies
 * whenever a choice changes, and applies the stored ones on the first render
 * so a reload comes back in the fonts it was left in.
 */
export function useFonts() {
  const [fonts, setStoredFonts] = useState(readFonts);

  useEffect(() => {
    applyFonts(fonts);
  }, [fonts]);

  const setFont = useCallback((role, family) => {
    setStoredFonts((current) => {
      // Normalised to the empty string here rather than at each call site:
      // clearing a choice arrives as undefined from one control and as '' from
      // another, and storage should not be able to tell the difference.
      const next = { ...current, [role]: family || '' };
      writeFonts(next);

      return next;
    });
  }, []);

  return { fonts, setFont };
}
