'use client';
import { useCallback, useEffect, useState } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query.js';
import {
  applyAppearance,
  readAppearance,
  resolveAppearance,
  writeAppearance,
} from '@/lib/appearance.js';

/**
 * Owns the appearance preference for the shell. Mount it once: the effect
 * re-applies whenever the preference changes, and whenever the OS flips while
 * the preference is "system".
 */
export function useAppearance() {
  const [appearance, setStoredAppearance] = useState(readAppearance);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance, prefersDark]);

  const setAppearance = useCallback((next) => {
    if (!next) return;
    writeAppearance(next);
    setStoredAppearance(next);
  }, []);

  return { appearance, resolved: resolveAppearance(appearance), setAppearance };
}
