'use client';
import { useEffect, useState } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query.js';

// The braille spinner every terminal harness uses, in its usual order. Ten
// frames of U+28xx, each lighting a different pair of the cell's dots, which
// is what makes it read as one thing turning rather than ten characters.
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// 80ms is the rate cli-spinners uses for this sequence, and it is worth
// copying rather than choosing: faster reads as a blur, slower as a stutter.
const FRAME_MS = 80;

/**
 * The pause before a reply begins.
 *
 * Decorative, and hidden from assistive technology on purpose. The pane
 * already announces the same state in words through a live region, and a
 * spinner cannot be read aloud — a screen reader given this would say
 * "braille pattern dots-1-2-4" ten times a second.
 *
 * A fixed width, which matters more than it looks. The bundled JetBrains Mono
 * carries no braille: fontsource ships latin, latin-ext, cyrillic, greek and
 * vietnamese, and U+2800 is in none of them. So these glyphs come from
 * whatever the system falls back to, whose frames need not all be the same
 * width — and a spinner that resized as it turned would shove the transcript
 * around once every 80ms.
 */
export function ReplyDots() {
  // A spinner that never stops is motion, and this one runs for as long as the
  // model takes. Somebody who has asked their system for less of that gets a
  // single held frame: still a mark where the answer will appear, without the
  // flicker.
  const still = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (still) return undefined;

    const turning = setInterval(() => {
      setFrame((current) => (current + 1) % FRAMES.length);
    }, FRAME_MS);

    return () => clearInterval(turning);
  }, [still]);

  return (
    <span
      aria-hidden="true"
      className="inline-block w-[1ch] py-1 text-center font-mono text-muted-foreground text-sm leading-none"
      data-slot="reply-dots"
    >
      {FRAMES[still ? 0 : frame]}
    </span>
  );
}
