# Dao COSS Shell Design QA

This records the Recent-first coss Workspace Shell pass. It describes the app as
it was at that milestone — Chats was still a disabled placeholder then, and the
AI surfaces did not exist. Later passes are recorded in the commits that made
them, and the QA server they were looked at through is `vite.qa.config.js`.

## Evidence

- Source visual truth: `/Users/rinki/.codex/generated_images/01a022fc-3e36-74f1-b3d2-a1d250f667af/exec-54edcbf1-a063-46c6-a0f7-d1cd1e9953a3.png`
- Implementation screenshot: `/Users/rinki/.codex/visualizations/2026/08/21/01a022fc-3e36-74f1-b3d2-a1d250f667af/dao-coss-shell-implementation-1487x1058.jpg`
- Full-view comparison: `/Users/rinki/.codex/visualizations/2026/08/21/01a022fc-3e36-74f1-b3d2-a1d250f667af/dao-coss-shell-comparison.png`
- Responsive comparison: `/Users/rinki/.codex/visualizations/2026/08/21/01a022fc-3e36-74f1-b3d2-a1d250f667af/dao-coss-shell-responsive-comparison.jpg`
- Viewport: `1487 x 1058` CSS pixels for the primary comparison; `1180 x 800` and `960 x 700` for window-resilience checks.
- Pixel dimensions: source `1487 x 1058`; implementation `1487 x 1058`; CSS viewport `1487 x 1058`; effective density `1x`. No density resampling was required.
- State: light appearance, Personal workspace, Home active, root `Welcome Note.md` selected, first project folder expanded, Recent notes/tasks visible, Info inspector active.
- Browser rendering: Codex in-app browser at `http://127.0.0.1:5173/`, using `vite.qa.config.js` deterministic API fixtures so no existing SQLite or Markdown data was changed.

## Full-view comparison

The final combined image was inspected at equal dimensions. The three-column tracks, sidebar and inspector widths, editor inset, toolbar position, selected rows, typography hierarchy, borders, and vertical rhythm now preserve the approved composition. Browser rendering intentionally cannot show Electron traffic lights or native vibrancy; the renderer keeps the same transparent sidebar geometry, while Electron owns those native effects.

## Focused region comparison

Separate crops were not needed: the 1:1 full-view comparison keeps the sidebar navigation/tree, editor toolbar/body, and inspector labels readable. The two additional responsive captures were combined separately because the only detail too small to judge in the full view was narrow-window navigation clipping.

## Required fidelity surfaces

- Fonts and typography: system-ui headings and UI text preserve the source hierarchy, optical weight, line height, and wrapping. The editor H1, section headings, file labels, metadata, and compact controls remain distinct at all checked widths.
- Spacing and layout rhythm: the final editor content begins on the same visual inset as the source; the toolbar and body share the intended left rhythm; the sidebar and inspector keep their proportions; no persistent controls overflow at the `960px` minimum width.
- Colors and tokens: neutral white surfaces, quiet blue-gray metadata, blue selection/active states, semantic priority colors, and restrained borders map to shared COSS/Tailwind tokens. No decorative gradients are used.
- Image quality and asset fidelity: the target contains no photographic or illustrative assets. Visible controls use Tabler icons; no handcrafted or inline SVG substitutes remain in the renderer.
- Copy and content: product copy is calm, local-first, and developer-native. The production Welcome Note explains folder aliases, Markdown durability, Tasks, Search, and local storage without adding AI claims.
- Interaction and accessibility: Home/Tasks/Search/Activity, disabled Chats, Recents, folder expansion, note switching, task selection, Settings, and `⌘K` Command were exercised. Focus indicators, semantic buttons, labeled inputs, dialogs, and reduced-motion handling remain present.

## Comparison history

### Pass 1 — blocked

- [P2] Editor body and toolbar were horizontally inset farther than the source. Fixed by using a full-width note column with a `3.5rem` content gutter and a fixed `1.8rem` toolbar inset.
- [P2] The first project folder started collapsed, weakening the file-tree hierarchy shown in the source. Fixed by opening the first folder by default while retaining Collapsible behavior.
- [P1] Clicking Home after selecting a task could produce an empty Home surface. Fixed by adding `openHome()`, which restores the latest valid Recent note rather than navigating to a dashboard or empty route.
- [P2] At the `960px` minimum window width, the primary nav clipped its last icon. Fixed by switching Home to icon-only and tightening nav spacing below `1160px`.

Post-fix evidence is the final full-view comparison plus `dao-coss-shell-960x700.jpg`. The Home regression was also re-tested after task selection; it restored `Welcome Note.md`.

### Pass 2 — passed

No actionable P0, P1, or P2 mismatch remained. Console error/warning collection was empty after Home, Tasks, Search, Activity, Settings, Recent switching, task selection, and Command interactions.

## Residual test gap and P3 polish

- [P3] Native `vibrancy: 'sidebar'`, traffic-light placement, and `-electron-corner-smoothing: system-ui` were verified in code, but a real Electron window capture was not produced because permission to launch the isolated Go service outside the sandbox was declined. Browser screenshots therefore show the correct translucent fallback color rather than macOS system material.
- [P3] Dynamic fixture density differs from the source below the fold; this does not affect shell geometry or the production Welcome Note template.

## Implementation checklist

- [x] Match the selected 1487 x 1058 shell composition.
- [x] Verify the minimum 960px window layout without clipped controls.
- [x] Exercise primary navigation, Recents, file tree, tasks, inspector, Settings, Search, Activity, and Command.
- [x] Check console warnings and errors.
- [x] Keep the Electron-only visual effect as an explicitly recorded runtime test gap.

final result: passed

## Later passes

The shell has been through further visual QA since, none of which changed the
composition above:

- Today, the AI provider settings, and the Settings dialog, at the AI Summary
  Loop milestone.
- Chats: the conversation list, a streamed reply, a reply that stops
  mid-thought, the lines saying what the model looked up, the rendered Markdown
  in both appearances, and stopping a reply.
- Iosevka Aile and Iosevka Extended throughout, which is what exposed the
  sidebar row that overflowed instead of truncating.

Each is recorded in the commit that made it, with what was looked at and what
was found.
