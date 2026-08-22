const STORAGE_KEY = 'dao.appearance';

/** @typedef {'system' | 'light' | 'dark'} Appearance */

export const APPEARANCES = ['system', 'light', 'dark'];

export const APPEARANCE_LABELS = {
  dark: 'Dark',
  light: 'Light',
  system: 'Match system',
};

export function readAppearance() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return APPEARANCES.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function writeAppearance(appearance) {
  try {
    window.localStorage.setItem(STORAGE_KEY, appearance);
  } catch {
    // Preference is cosmetic; losing it is better than failing to apply it.
  }
}

export function resolveAppearance(appearance) {
  if (appearance !== 'system') return appearance;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Paints the resolved appearance on the document and asks Electron to move
 * `nativeTheme` with it, so the native window materials (vibrancy, traffic
 * lights, menus) match the renderer instead of staying on the OS setting.
 */
export function applyAppearance(appearance) {
  const resolved = resolveAppearance(appearance);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  window.dao?.setAppearance?.(appearance);
  return resolved;
}
