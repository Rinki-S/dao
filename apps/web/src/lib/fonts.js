/**
 * The three faces somebody can choose, and where each one lands.
 *
 * `variable` is the CSS custom property the choice is written to. Each is the
 * first entry of the matching --font-* token in index.css, so setting one
 * changes that token everywhere and unsetting it returns the bundled default —
 * which is why nothing here ever writes the default down. A stored value means
 * "somebody chose this"; an absent one means "whatever the app ships with",
 * and those must not be the same string or a future change of default would
 * silently not reach anybody who had ever opened Settings.
 */
export const FONT_ROLES = [
  {
    id: 'interface',
    variable: '--chosen-font-interface',
    label: 'Interface',
    description: 'Menus, sidebars, buttons and every label in the app.',
    fallback: 'Public Sans',
  },
  {
    id: 'editor',
    variable: '--chosen-font-editor',
    label: 'Editor',
    description: 'The text of a note while you are writing it.',
    fallback: 'Follows the interface',
  },
  {
    id: 'mono',
    variable: '--chosen-font-mono',
    label: 'Monospace',
    description: 'Code blocks, in notes and in replies.',
    fallback: 'JetBrains Mono',
  },
];

const STORAGE_KEY = 'dao.fonts';

/** The empty choice: nothing picked, everything bundled. */
export const NO_FONTS = { interface: '', editor: '', mono: '' };

/**
 * A family name as CSS, quoted.
 *
 * Always quoted, never conditionally. An unquoted family name is a sequence of
 * CSS identifiers, which is fine for Menlo and wrong for "1942 report" or
 * anything containing a character an identifier cannot hold. Quoting always is
 * one rule instead of a test that has to be right about CSS's grammar.
 *
 * The quote and the backslash are escaped for the same reason a name is
 * quoted at all: these strings come from the machine's font directory, and a
 * font file can be named anything at all.
 */
export function cssFamily(name) {
  return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function readFonts() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');

    // Field by field, and only strings. This is parsed JSON from storage the
    // user's other tabs and versions of this app have written to; taking the
    // object as it comes would put whatever it holds into a style attribute.
    return {
      interface: typeof stored.interface === 'string' ? stored.interface : '',
      editor: typeof stored.editor === 'string' ? stored.editor : '',
      mono: typeof stored.mono === 'string' ? stored.mono : '',
    };
  } catch {
    return { ...NO_FONTS };
  }
}

export function writeFonts(fonts) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fonts));
  } catch {
    // The preference is cosmetic. Losing it is better than failing to apply it.
  }
}

/**
 * Puts the choices on the document, and takes absent ones back off.
 *
 * Removing rather than setting an empty string: an empty custom property is a
 * value, and `var(--chosen-font-interface, 'Public Sans Variable')` resolves to
 * it rather than to the fallback. Clearing a choice has to leave the property
 * genuinely unset or the interface ends up with no family at all.
 */
export function applyFonts(fonts) {
  const root = document.documentElement;

  for (const role of FONT_ROLES) {
    const chosen = fonts?.[role.id];
    if (chosen) {
      root.style.setProperty(role.variable, cssFamily(chosen));
    } else {
      root.style.removeProperty(role.variable);
    }
  }
}

/**
 * The font families installed on this machine.
 *
 * Through the Local Font Access API, which is permissioned — the set of fonts
 * somebody has installed identifies them well enough that a browser will not
 * hand it over for the asking. So this must be called from a gesture, and it
 * can be refused. Both of those are the caller's to handle: it returns null
 * for "cannot", which is a different thing from an empty list.
 *
 * Families, not faces. The API answers with one entry per style — Helvetica
 * Bold and Helvetica Oblique are separate FontData — and what somebody picks
 * is a family, with the weight and the slope left to the interface that uses
 * it. Deduplicated by family and sorted by the name as it is shown.
 */
export async function listInstalledFonts() {
  if (typeof window.queryLocalFonts !== 'function') return commonFonts();

  let faces;
  try {
    faces = await window.queryLocalFonts();
  } catch {
    // Refused, or asked for outside a gesture. Not an error worth reporting as
    // one, and not a reason to offer nothing: the short list below needs no
    // permission and covers what most people would have reached for anyway.
    return commonFonts();
  }

  const families = new Set();
  for (const face of faces) {
    if (face?.family) families.add(face.family);
  }

  return [...families].sort((a, b) => a.localeCompare(b));
}

/**
 * The faces worth offering when the machine will not say what it has.
 *
 * Every one of these ships with macOS, Windows or both, and each is checked
 * before it is offered — naming a font that is not there would produce a
 * picker whose choices silently do nothing. `document.fonts.check` answers
 * that for an installed family and needs no permission, which is the whole
 * reason this list can exist.
 *
 * It is a fallback and reads like one. Nobody's favourite face is in here
 * unless it is also everybody's.
 */
const COMMON_FAMILIES = [
  'Arial',
  'Avenir Next',
  'Cambria',
  'Charter',
  'Consolas',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Helvetica Neue',
  'Iowan Old Style',
  'Menlo',
  'Monaco',
  'New York',
  'Optima',
  'Palatino',
  'SF Mono',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
];

function commonFonts() {
  if (typeof document === 'undefined' || !document.fonts?.check) return [];

  return COMMON_FAMILIES.filter((family) => {
    try {
      return document.fonts.check(`12px ${cssFamily(family)}`);
    } catch {
      return false;
    }
  });
}
