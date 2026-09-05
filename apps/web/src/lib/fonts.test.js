import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyFonts, cssFamily, listInstalledFonts, readFonts, writeFonts } from './fonts.js';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('style');
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.queryLocalFonts;
  delete document.fonts;
});

/**
 * jsdom implements no FontFaceSet, so `document.fonts` is not something that
 * can be spied on — it has to be put there. Which is the same reason the code
 * under test guards before reaching for it.
 */
function stubFontSet(check) {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { check: vi.fn(check) },
  });
}

describe('cssFamily', () => {
  it('quotes every name, not only the ones that look like they need it', () => {
    // Unquoted, a family name is a sequence of CSS identifiers. That happens to
    // work for Menlo and not for a name starting with a digit.
    expect(cssFamily('Menlo')).toBe('"Menlo"');
    expect(cssFamily('1942 report')).toBe('"1942 report"');
  });

  it('escapes what would otherwise end the string early', () => {
    // These names come from a font directory, and a file can be called
    // anything. A quote that closed the declaration would put the rest of the
    // name into the style attribute as something other than a family name.
    expect(cssFamily('He said "hi"')).toBe('"He said \\"hi\\""');
    expect(cssFamily('back\\slash')).toBe('"back\\\\slash"');
  });
});

describe('readFonts', () => {
  it('is empty when nobody has chosen', () => {
    expect(readFonts()).toEqual({ interface: '', editor: '', mono: '' });
  });

  it('reads back what was written', () => {
    writeFonts({ interface: 'Georgia', editor: 'Charter', mono: 'Menlo' });

    expect(readFonts()).toEqual({ interface: 'Georgia', editor: 'Charter', mono: 'Menlo' });
  });

  it('takes only strings out of storage', () => {
    // Storage is written by other tabs and older versions of this app. What
    // comes out goes into a style attribute, so it is read field by field
    // rather than spread.
    window.localStorage.setItem(
      'dao.fonts',
      JSON.stringify({ interface: { toString: 'nope' }, editor: 42, mono: 'Menlo' }),
    );

    expect(readFonts()).toEqual({ interface: '', editor: '', mono: 'Menlo' });
  });

  it('survives storage that is not JSON at all', () => {
    window.localStorage.setItem('dao.fonts', 'not json');

    expect(readFonts()).toEqual({ interface: '', editor: '', mono: '' });
  });
});

describe('applyFonts', () => {
  it('puts a chosen family on the document, quoted', () => {
    applyFonts({ interface: 'Georgia', editor: '', mono: '' });

    expect(document.documentElement.style.getPropertyValue('--chosen-font-interface')).toBe(
      '"Georgia"',
    );
  });

  it('removes the property rather than emptying it', () => {
    applyFonts({ interface: 'Georgia', editor: '', mono: '' });
    applyFonts({ interface: '', editor: '', mono: '' });

    // An empty custom property is a value, and `var(--x, fallback)` resolves to
    // it rather than to the fallback — so clearing a choice this way would
    // leave the interface with no font family at all.
    expect(document.documentElement.style.getPropertyValue('--chosen-font-interface')).toBe('');
    expect(document.documentElement.getAttribute('style') ?? '').not.toContain(
      '--chosen-font-interface',
    );
  });
});

describe('listInstalledFonts', () => {
  it('reports families once each, sorted, rather than one row per style', () => {
    window.queryLocalFonts = vi.fn().mockResolvedValue([
      { family: 'Helvetica', style: 'Regular' },
      { family: 'Helvetica', style: 'Bold' },
      { family: 'Avenir', style: 'Regular' },
    ]);

    return expect(listInstalledFonts()).resolves.toEqual(['Avenir', 'Helvetica']);
  });

  it('falls back to a checked shortlist when the query is refused', async () => {
    window.queryLocalFonts = vi.fn().mockRejectedValue(new Error('denied'));
    // Only what the machine actually reports as available: offering a font
    // that is not installed makes a choice that silently does nothing.
    stubFontSet((font) => font.includes('Georgia'));

    await expect(listInstalledFonts()).resolves.toEqual(['Georgia']);
  });

  it('falls back the same way when the API is not there at all', async () => {
    stubFontSet((font) => font.includes('Menlo'));

    // Not null, and not a throw: a browser without the query still gets a
    // working picker, it just gets a shorter one.
    await expect(listInstalledFonts()).resolves.toEqual(['Menlo']);
  });

  it('offers nothing rather than throwing where there is no font set to ask', () => {
    // jsdom is this case, and so is any environment that has neither API. The
    // picker shows an empty list; it does not take the settings dialog down.
    expect(document.fonts).toBeUndefined();

    return expect(listInstalledFonts()).resolves.toEqual([]);
  });
});
