'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from '@/components/ui/combobox.jsx';
import { cssFamily, listInstalledFonts } from '@/lib/fonts.js';

/** The entry that means "no choice", which is not the same as a font. */
const DEFAULT_VALUE = '';

/**
 * One font choice, from the families installed on this machine.
 *
 * Every name is drawn in its own face. A list of font names set in one font is
 * a list of words: the only question somebody has when picking a typeface is
 * what it looks like, and answering it anywhere other than in the list means
 * choosing, looking, and choosing again.
 *
 * Which is also the thing that makes this list expensive. A machine can have
 * several hundred families on it, and every row in a different face is several
 * hundred fonts for the browser to resolve, shape and lay out. The rows carry
 * `content-visibility: auto` for that: the browser skips all of that work for
 * a row that is not on screen, and does it when it scrolls into view. It is
 * the same saving virtualising the list would buy — off-screen rows cost
 * nothing — without a second scroll implementation to keep in step with the
 * combobox's own keyboard handling. `contain-intrinsic-size` is what a skipped
 * row is assumed to measure until it is really measured, so the scrollbar does
 * not jump about as one scrolls.
 */
export function FontPicker({ id, value, fallbackLabel, onChange }) {
  const [families, setFamilies] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  // The search text, held here rather than left to the combobox.
  //
  // Left alone, opening a picker that already has a font selected starts with
  // that font's name in the box — which filters the list down to the one font
  // already chosen, so the control cannot be browsed at all without first
  // clearing it. Emptied on open and put back on close, below.
  const [query, setQuery] = useState('');
  // Asked for once per mount. The set of installed fonts does not change while
  // a settings dialog is open, and re-querying on every open would spend a
  // permission prompt's worth of work to learn the same answer.
  const asked = useRef(false);

  const load = useCallback(async () => {
    if (asked.current) return;
    asked.current = true;
    setLoading(true);
    try {
      setFamilies((await listInstalledFonts()) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const items = useMemo(() => {
    const entries = [{ value: DEFAULT_VALUE, label: fallbackLabel, family: '' }];

    for (const family of families ?? []) {
      entries.push({ value: family, label: family, family });
    }

    // A font that was chosen and has since been uninstalled is still the
    // choice, and saying so is better than showing the picker as though
    // nobody had ever set it. It sorts to the end because it is not among the
    // families this machine reported.
    if (value && !(families ?? []).includes(value)) {
      entries.push({ value, label: `${value} (not installed)`, family: value });
    }

    return entries;
  }, [families, fallbackLabel, value]);

  const selected = useMemo(
    () => items.find((item) => item.value === value) ?? items[0],
    [items, value],
  );

  return (
    <Combobox
      isItemEqualToValue={(a, b) => a?.value === b?.value}
      itemToStringLabel={(item) => item?.label ?? ''}
      // Derived, not synchronised. While the list is open the field holds
      // whatever is being searched for; while it is closed it holds the name
      // of the chosen font. Kept as one expression rather than as state put
      // back by an effect, which would render twice to say the same thing and
      // would have to know whether choosing a font closes the popup before or
      // after it changes the value.
      inputValue={open ? query : (selected?.label ?? '')}
      items={items}
      open={open}
      value={selected}
      onInputValueChange={setQuery}
      onOpenChange={(next) => {
        setOpen(next);
        // Loaded on open rather than on mount, and this is the gesture the
        // Local Font Access API requires: a permission prompt that appeared
        // because somebody opened Settings, rather than because they opened a
        // font picker, would be a prompt with no visible cause.
        if (next) {
          setQuery('');
          void load();
        }
      }}
      onValueChange={(item) => onChange(item?.family ?? '')}
    >
      {/* The field itself is set in whatever is currently chosen, so the
          answer to "what did I pick?" does not need the list reopened. */}
      <ComboboxInput
        id={id}
        placeholder="Search installed fonts…"
        size="sm"
        style={value ? { fontFamily: cssFamily(value) } : undefined}
      />
      <ComboboxPopup>
        <ComboboxEmpty>
          {loading ? 'Reading your installed fonts…' : 'No font by that name.'}
        </ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem
              className="[contain-intrinsic-size:auto_1.75rem] [content-visibility:auto]"
              key={item.value}
              // The default row is deliberately not set in the default face:
              // it does not name a font, it says that none was chosen.
              style={item.family ? { fontFamily: cssFamily(item.family) } : undefined}
              value={item}
            >
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
