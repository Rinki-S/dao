# 001 — Ease the sidebar's material and shadow between peeked and docked

- **Status**: DONE (executed with a deviation — see Execution note)
- **Commit**: 8bdb99c
- **Severity**: MEDIUM
- **Category**: Easing & duration / Cohesion & tokens
- **Estimated scope**: 2 files, ~4 lines

## Problem

The sidebar has two materials. Docked at the window edge it is translucent so
the macOS `vibrancy: 'sidebar'` shows through. Peeked open over the workspace
it is opaque, with a shadow, so the note underneath does not read through it.

Peeking and un-peeking swap those two materials, but neither property that
changes is in a transition, so both hard-cut in a single frame while everything
around them animates for 200ms. That frame is the flicker.

**What animates today.** The gap element that pushes the workspace across:

```jsx
// apps/web/src/components/ui/sidebar.jsx:215 — current
'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-shell',
```

and the container that slides the panel:

```jsx
// apps/web/src/components/ui/sidebar.jsx:226 — current
'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-shell md:flex',
```

**What does not.** The peek adds an opaque colour and a shadow:

```jsx
// apps/web/src/components/shell/DaoSidebar.jsx:369 — current
className={cn(peeked && 'left-0! [--sidebar:var(--sidebar-solid)] shadow-xl/10')}
```

- `--sidebar` is consumed by `bg-sidebar` on the inner surface, which has **no
  `transition` at all** (`apps/web/src/components/ui/sidebar.jsx:240`), so the
  background jumps between `oklch(26% 0.016 258 / 55%)` and
  `oklch(26% 0.016 258)` instantly (dark; light is the 68% / opaque pair at
  `apps/web/src/index.css:49` and `:53`).
- `shadow-xl/10` lands on the container, whose transition list is
  `left,right,width` — **`box-shadow` is not in it**, so the shadow appears and
  disappears in one frame.

**Why it reads as "harsh expand".** Clicking the trigger while peeked sets
`peeking = false` and `open = true` in the same React batch. `left` is `0` in
both states, so the panel itself does not move at all — the only motion is the
workspace sliding 256px out from under it over 200ms. Against that slide, an
instant material swap is the one thing in the frame that does not ease.

**Ordering matters, and it is asymmetric.** The opaque material exists only
because content sits under the panel:

- Peeking **in**, the panel arrives over content that is already there, so it
  must be opaque from the first frame — no delay.
- Peeking **out** (to docked or hidden), the content is still sliding out from
  under the panel for 200ms. Fading to translucent immediately would show the
  moving surface edge ghosting through the tree. The fade should wait for the
  slide to land.

A single symmetric transition would fix the flicker and introduce ghosting, so
the delay differs per direction.

## Target

Three changes, no new tokens.

**1. Container transitions its shadow with the slide** — same 200ms and
`--ease-shell` already on that element:

```jsx
/* apps/web/src/components/ui/sidebar.jsx:226 — target */
'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width,box-shadow] duration-200 ease-shell md:flex',
```

**2. Inner surface transitions its background, delayed so the slide lands
first**:

```jsx
/* apps/web/src/components/ui/sidebar.jsx:240 — target */
'flex h-full w-full flex-col bg-sidebar transition-[background-color] delay-[160ms] duration-[140ms] ease-shell group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm/5',
```

**3. The peeked state cancels that delay**, so becoming opaque is immediate:

```jsx
/* apps/web/src/components/shell/DaoSidebar.jsx:369 — target */
className={cn(
  peeked &&
    'left-0! [--sidebar:var(--sidebar-solid)] shadow-xl/10 [&_[data-slot=sidebar-inner]]:delay-0',
)}
```

CSS takes `transition-delay` from the **destination** state, which is what makes
the asymmetry work with one declaration each: transitioning *to* peeked reads
`delay-0` (immediate opacity), transitioning *away from* peeked reads the base
`delay-[160ms]` (waits out the 200ms slide, then fades over 140ms).

Changing an unregistered custom property does trigger a transition on the
property that references it, so overriding `--sidebar` on the container animates
`background-color` on the inner surface. No `@property` registration needed.

## Repo conventions to follow

- Motion tokens live in `apps/web/src/index.css` inside `@theme`
  (`apps/web/src/index.css:101`): `--ease-shell: cubic-bezier(0.32, 0.72, 0, 1)`
  for shell motion, `--duration-overlay: 140ms` for overlays. **Reuse
  `ease-shell`; do not add a curve.** It is already the iOS-drawer curve this
  motion wants.
- Shell motion runs at `duration-200`, hardcoded alongside `ease-shell` — see
  the exemplar at `apps/web/src/components/ui/sidebar.jsx:215` (the gap element).
  Match that literal rather than introducing a duration token.
- `apps/web/src/components/ui/sidebar.jsx` is a vendored coss registry component
  that this repo already edits deliberately (its `ease-linear` was replaced with
  `ease-shell`). Editing it again is expected; keep edits to motion properties.
- The two-material pair is documented at `apps/web/src/index.css:50-52`.

## Steps

1. `apps/web/src/components/ui/sidebar.jsx:226` — in the `sidebar-container`
   class string, change `transition-[left,right,width]` to
   `transition-[left,right,width,box-shadow]`. Change nothing else on the line.
2. `apps/web/src/components/ui/sidebar.jsx:240` — in the `sidebar-inner` class
   string, insert `transition-[background-color] delay-[160ms] duration-[140ms] ease-shell`
   immediately after `bg-sidebar`. Leave the `group-data-[variant=floating]:*`
   classes untouched and in place.
3. `apps/web/src/components/shell/DaoSidebar.jsx:369` — append
   `[&_[data-slot=sidebar-inner]]:delay-0` to the peeked class string, after
   `shadow-xl/10`.
4. Run `pnpm --dir apps/web format` so the class strings match Prettier's
   wrapping.

## Boundaries

- Do NOT touch the mobile `Sheet` branch of `Sidebar`
  (`apps/web/src/components/ui/sidebar.jsx:184`) — it has its own material and
  is not part of the peek.
- Do NOT change `--sidebar`, `--sidebar-solid`, or any colour value in
  `apps/web/src/index.css`. The palette is correct; only its timing is wrong.
- Do NOT change `left`, `width`, the 200ms slide, or the peek's retract logic in
  `apps/web/src/components/shell/DaoSidebar.jsx`.
- Do NOT add a `prefers-reduced-motion` guard here. This repo has none anywhere
  yet; adding one in a single component would be inconsistent. It is tracked as
  a separate item in `plans/README.md`.
- Do NOT add dependencies.
- If a line does not match the excerpt above (drift since 8bdb99c), STOP and
  report rather than improvising.

## Verification

- **Mechanical**:
  - `pnpm --dir apps/web lint` — no output.
  - `pnpm --dir apps/web format:check` — "All matched files use Prettier code style!".
  - `pnpm --dir apps/web test` — 107 passed. (No test covers this; it is a
    regression guard only.)
- **Feel check** — this is the real verification; the values above cannot be
  judged from code. Run the desktop app (`pnpm --filter @dao/web dev` on 5173,
  then `pnpm --dir apps/desktop dev`) and with the sidebar hidden:
  - **Peek in**: move the pointer to the left edge. The panel must be fully
    opaque for the whole slide — at no point should the note text be visible
    through the tree.
  - **Peek out** (pointer to the right): the workspace must finish sliding back
    under the panel *before* the panel starts going translucent. If you can see
    the surface edge moving through the tree, `delay-[160ms]` is too short.
  - **Peek → docked**: click the trigger while peeked. The shadow should fade
    out over the same 200ms as the workspace slide, and the material should
    settle to translucent just after the slide lands. No single-frame jump.
  - In DevTools → Animations, set playback speed to 10% and step through
    peek → docked; confirm the shadow and the workspace slide start together and
    that the background fade begins after them, not at t=0.
  - Confirm the docked steady state is unchanged: the sidebar is still
    translucent over the macOS material, with no shadow.
- **Done when**: peeking in, peeking out, and peek → docked all read as one
  continuous movement with no frame where the material or shadow snaps, and the
  docked and peeked steady states look exactly as they do today.

## Execution note (deviation from the plan as written)

Steps 2 and 3 were **not** shipped as specified. Transitioning `background-color`
on the surface would have coupled the peek to the theme: `--sidebar` is
redefined by `.dark` (`apps/web/src/index.css:93`) while
`--sidebar-foreground` follows `--foreground` with no transition, so switching
appearance would have faded the sidebar's background for 160ms + 140ms while its
text switched instantly — up to 300ms of low-contrast text in the sidebar. The
plan's author did not consider theme switching as a second consumer of
`--sidebar`.

What shipped instead: an opaque backing layer behind the translucent surface,
whose **opacity** animates.

```jsx
/* apps/web/src/components/shell/DaoSidebar.jsx:369 — shipped */
className={cn(
  'before:pointer-events-none before:absolute before:-z-1 before:inset-0 before:bg-(--sidebar-solid) before:opacity-0 before:transition-opacity before:delay-[160ms] before:duration-[140ms] before:ease-shell',
  peeked && 'left-0! shadow-xl/10 before:opacity-100 before:delay-0 before:duration-0',
)}
```

Why this is better on three counts:

- **Theme-safe.** The layer's colour comes from `--sidebar-solid` and switches
  instantly with every other token. Only opacity animates.
- **Composited.** `opacity` runs on the compositor; `background-color` repaints.
- **No vendored edit for the surface.** Only step 1 (the container's
  `box-shadow` transition) still touches `apps/web/src/components/ui/sidebar.jsx`.

The asymmetric-delay technique is unchanged and still reads from the destination
state. The way *in* uses a shorter `duration-[100ms]` with no delay: the slide's
`ease-shell` is front-loaded, so a fade matching the 140ms of the way out would
leave the panel visibly translucent over the workspace while it crossed. 100ms
finishes at half the slide — quick enough to stay ahead of the leading edge,
long enough to read as the material arriving rather than being swapped in.

`-z-1` keeps the layer behind the surface — a positioned pseudo-element would
otherwise paint above the static content. The convention comes from
`apps/web/src/components/ui/tabs.jsx:43`.
