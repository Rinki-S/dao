# Dao Development Log

This log records meaningful development milestones and near-term direction.

## Milestone 0: Workspace Loop

Status: complete

Dao now has the smallest Electron + React + Go + SQLite loop:

```txt
Electron app starts
React renders the UI
Electron starts the Go local service
Go service runs SQLite migrations
SQLite stores workspace data
React lists and creates workspaces
```

Implemented pieces:

- React + Vite renderer
- Electron desktop shell
- Electron preload bridge
- Go local service with `/health`
- SQLite database initialization
- Goose migration for `workspaces`
- Workspace repository and API
- Vite proxy for local development API calls
- Tailwind CSS setup
- Workspace list and creation UI

Important decisions:

- Keep Electron Main thin.
- Keep business logic and persistence in Go.
- Use local HTTP between React and Go.
- Use SQLite as the first local database.
- Use `net/http` first, with a possible future move to `chi` when routing and middleware complexity justify it.
- Use Tailwind CSS for styling.
- The initial component-system choice changed over later milestones; the current foundation is shadcn backed by Base UI, with a shared CSS radius token scale and Dao design tokens.

## Milestone 1: Project Loop

Status: complete

Branch:

```txt
feat/project-api-ui
```

Goal:

```txt
Projects can be created, persisted in SQLite, listed through the Go API, and displayed in React.
```

Completed scope:

- create `projects` migration
- add project repository
- add `GET /api/projects`
- add `POST /api/projects`
- validate project API responses in React with Zod
- add project list and creation UI
- associate projects with a workspace through `workspace_id`

Keep deferred:

- project detail page
- task linkage
- search indexing
- command palette integration
- AI features

Notes:

- SQLite uses `snake_case` column names.
- HTTP JSON uses `camelCase` field names.
- Project JSON uses `workspaceId`, while SQLite uses `workspace_id`.
- Project list and creation currently use the selected workspace in the React UI.

## Milestone 2: Task Loop

Status: complete

Branch:

```txt
feat/task-api-ui
```

Goal:

```txt
Tasks can be created, persisted in SQLite, listed through the Go API, and displayed in React.
```

Completed scope:

- create `tasks` migration
- add task repository
- add `GET /api/tasks`
- add `POST /api/tasks`
- validate task API responses in React with Zod
- add task list and creation UI
- associate tasks with a workspace through `workspace_id`
- optionally associate tasks with a project through `project_id`

Initial task fields:

```txt
id
workspace_id
project_id
title
description
status
priority
due_date
created_at
updated_at
deleted_at
version
sync_status
```

Keep deferred:

- task detail page
- drag-and-drop task board
- recurring tasks
- reminders
- search indexing
- command palette integration

Notes:

- Task JSON uses `workspaceId`, `projectId`, and `dueDate`.
- SQLite uses `workspace_id`, `project_id`, and `due_date`.
- Task `status` starts as `todo`.
- Task `priority` defaults to `medium`.
- The React UI supports creating tasks in a workspace with an optional project association.

## Milestone 3: Note Loop

Status: complete

Branch:

```txt
feat/note-api-ui
```

Goal:

```txt
Notes can be created, persisted in SQLite, listed through the Go API, and displayed in React.
```

Completed scope:

- create `notes` migration
- add note repository
- add `GET /api/notes`
- add `POST /api/notes`
- validate note API responses in React with Zod
- add note list and creation UI
- associate notes with a workspace through `workspace_id`
- optionally associate notes with a project through `project_id`

Initial note fields:

```txt
id
workspace_id
project_id
title
content
content_type
note_type
created_at
updated_at
deleted_at
version
sync_status
```

Keep deferred:

- full note editor
- markdown preview
- note detail page
- note tags
- note search indexing
- command palette integration

Tag decision:

- Tags are a valid future organization feature for notes.
- Do not implement tags in the basic Note Loop.
- Prefer a normalized tag model over storing plain tag text directly on notes.
- Future options include `tags` + `note_tags`, or a more general tagging model that can also support tasks, projects, learning records, snippets, and extension data.
- Revisit tags during a later search, filtering, or organization milestone.

Notes:

- Note JSON uses `workspaceId`, `projectId`, `contentType`, and `noteType`.
- SQLite uses `workspace_id`, `project_id`, `content_type`, and `note_type`.
- Note `contentType` starts as `markdown`.
- Note `noteType` defaults to `general`.
- The React UI supports creating notes in a workspace with an optional project association.

## Milestone 4: Search Loop

Status: complete

Branch:

```txt
feat/search-api-ui
```

Goal:

```txt
Users can search across projects, tasks, and notes through SQLite-backed local search.
```

Completed scope:

- add SQLite FTS5 search schema
- index project name and description
- index task title and description
- index note title and content
- add `GET /api/search?q=`
- validate search API responses in React with Zod
- add a basic search UI
- keep search scoped to local data

Initial indexing strategy:

- Use a shared SQLite FTS5 table named `search_index`.
- Store searchable rows for projects, tasks, and notes.
- Keep `workspace_id` and `project_id` as unindexed metadata for filtering.
- In the first implementation, write search index rows explicitly from create flows instead of adding database triggers.
- If update/delete behavior grows more complex, revisit a dedicated search service, trigger-based indexing, or a rebuild-index command.

Keep deferred:

- semantic search
- embeddings
- AI retrieval
- advanced filters
- ranking customization
- command palette integration

Notes:

- Search uses SQLite FTS5 through the shared `search_index` table.
- Project, task, and note create flows explicitly write search index rows.
- Entity creation and search indexing run in the same transaction.
- Search query input is sanitized before reaching FTS5 `MATCH`.
- Existing data created before the search index was introduced is not automatically backfilled yet.

## Milestone 5: Command Palette Loop

Status: complete

Branch:

```txt
feat/command-palette
```

Goal:

```txt
Users can open a command palette and quickly trigger core workspace actions.
```

Completed scope:

- add command palette UI
- support `Command/Ctrl + Shift + P`
- register core commands
- support quick navigation to workspace sections
- support create workspace/project/task/note commands at a basic level
- keep command registration simple until the extension registry exists
- add `Switch Workspace` as a first-class MVP command
- split command definitions and filtering logic from the React component
- add Vitest and Testing Library coverage for command filtering and keyboard interaction

Keep deferred:

- fuzzy command ranking
- extension command registration
- AI commands
- command history
- global desktop shortcut

Notes:

- Command execution currently stays in the React renderer and focuses existing UI surfaces.
- Create commands intentionally focus the relevant form instead of duplicating create API logic inside the palette.
- Command registration remains static until the extension registry milestone introduces a broader registration contract.
- Command palette tests currently cover filtering, open/close behavior, keyboard selection, command execution, hash updates, and focus targets.

## Milestone 6: Activity Log Loop

Status: complete

Branch:

```txt
feat/activity-log
```

Goal:

```txt
Dao records important local user actions so future review and AI summaries have reliable activity context.
```

Product direction:

```txt
Activity Log is an internal event layer, not a detailed user-facing feed.
```

User-facing activity should appear later as lightweight aggregate metrics, review signals, or AI-generated summaries.

Completed scope:

- add `activities` SQLite migration
- add activity model and repository in the Go local service
- write activity rows from create workspace/project/task/note flows
- add `GET /api/activities`
- add `GET /api/activities/metrics`
- validate activity API responses in React with Zod
- show lightweight aggregate activity metrics in the React renderer
- keep activity logging explicit and small for the MVP
- refresh lightweight activity metrics after create actions with a small frontend event

Keep deferred:

- detailed activity feed UI
- richer dashboard activity metrics
- shared query invalidation or React Query
- activity filters
- timeline grouping
- activity editing
- analytics
- AI summaries

Notes:

- Activity rows are written from the existing create flows, inside the same transaction as the source entity where applicable.
- Activity metrics are deliberately aggregate-only so the feature supports future review and AI context without exposing a detailed user-facing feed.
- The frontend uses a small local event to refresh metrics after successful create actions.
- Shared query invalidation or React Query remains deferred until more frontend data surfaces need coordinated cache behavior.

## Milestone 7: Extension Registry Loop

Status: complete

Branch:

```txt
feat/extension-registry
```

Goal:

```txt
Dao defines a small built-in extension registry so core modules can expose commands, sidebar items, and surfaces through a consistent contract.
```

Completed scope:

- document the first extension registry contract
- keep the registry limited to built-in extensions
- model extensions as capability providers rather than sidebar entries
- move existing core module navigation metadata toward registry-driven definitions
- prepare command registration for extension-owned commands
- split built-in extension definitions by core domain
- add command, sidebar item, and surface capability helpers
- render app surfaces in registry order while keeping React component assembly in the app layer
- validate built-in extensions at the registry boundary with Zod
- keep third-party plugin marketplace support deferred

Design constraints:

- support built-in extension capabilities first: commands, sidebar items, and surfaces
- leave room for future routes, importers, exporters, content transforms, browser integrations, file handlers, background jobs, settings sections, and AI context providers
- avoid dynamic external plugin loading, marketplace distribution, signing, sandboxing, and permission prompts in the MVP
- keep command capabilities lightweight so they route users to existing UI flows instead of bypassing page validation and state

Notes:

- Command Palette reads registered command capabilities instead of owning a static command list.
- Sidebar navigation reads registered sidebar item capabilities.
- The main app renders registered surfaces in registry order.
- `registeredExtensions` is parsed from `builtInExtensions` with Zod before registry helpers consume it.
- Extension metadata remains declarative; React components are still explicitly mapped in the app layer.

Keep deferred:

- route capability and route library integration
- third-party plugin marketplace
- dynamic external plugin loading
- plugin permissions, signing, sandboxing, and review
- importer, exporter, transform, browser integration, job, settings, and AI context provider capabilities

## Milestone 8: UI Foundation

Status: complete

Branch:

```txt
feat/ui-foundation
```

Goal:

```txt
Dao replaces temporary test-oriented renderer styling with a consistent shadcn/ui foundation.
```

Completed scope:

- switch the renderer UI direction to shadcn/ui
- configure shadcn/ui for the Vite React app
- add the initial shadcn component set used by current MVP surfaces
- migrate workspace, project, task, note, search, activity metrics, and settings surfaces to shadcn component composition
- migrate the command palette to shadcn `Command` and `Dialog` backed by `cmdk`
- group command palette commands by extension-provided `command.group`
- use `Kbd` for command palette keyboard hints
- align app shell styling with semantic Tailwind tokens
- apply Geist Variable as the UI body font and Outfit Variable as the heading font
- remove unused Vite starter assets and early workspace form CSS
- keep current screens functionally equivalent while preparing for product UI work

Keep deferred:

- product-grade app shell information architecture
- route-like active surface navigation
- dashboard redesign
- project detail page
- task workspace layout
- note editor and preview experience
- filesystem-backed markdown notes with realtime autosave
- WYSIWYG markdown editor exploration
- scoped custom markdown renderer exploration
- design token consolidation in `src/index.css`
- reusable Dao-specific component wrappers above shadcn/ui
- visual QA with browser screenshots across desktop and small viewports

Notes:

- This milestone is a UI foundation milestone, not the final product UI.
- This milestone used a shadcn-style local component layer. Dao later chose to migrate the component foundation to HeroUI while keeping Dao-specific composition and product density.
- Current screens still primarily expose MVP create/list/test flows.
- The next UI phase should turn the renderer from stacked feature panels into a real product workspace.
- The first product UI branch should focus on the app shell, active surface navigation, dashboard shape, and command palette fit inside the product workflow.

## Historical Foundation Migration: HeroUI and hugeicons

Status: complete

Branch:

```txt
feat/heroui-hugeicons
```

Goal:

```txt
Dao moves its React component foundation to HeroUI and replaces Material Symbols with hugeicons.
```

Direction:

- use HeroUI as the maintained accessible primitive layer for buttons, inputs, overlays, tables, menus, keyboard hints, and related controls
- keep Dao-specific layout and product composition in app-owned components
- import HeroUI components directly in migrated or new UI code instead of creating shadcn-compatible wrapper layers
- keep `cmdk` as the command palette interaction core; use HeroUI for the modal shell, keyboard hints, colors, and overlay behavior
- import hugeicons directly where icons are used; do not add a centralized icon gateway
- replace `@nine-thirty-five/material-symbols-react` with `@hugeicons/react` and `@hugeicons/core-free-icons`
- remove shadcn, Radix, class-variance-authority, and tailwind-merge only after no current component imports depend on them

Completed scope:

- install HeroUI and hugeicons dependencies
- import HeroUI styles after Tailwind CSS
- define Dao's HeroUI theme variables in `apps/web/src/index.css`
- set the current app font to Funnel Sans Variable
- migrate the titlebar, sidebar, workspace switcher, project tree, project contents, task panel, settings panel, onboarding, command palette shell, and note editor shell toward HeroUI
- replace Material Symbols usage with direct hugeicons imports
- keep extension-owned content format icons in the extension registry, including the built-in `markdown` content format
- keep the command palette on `cmdk` while styling it with HeroUI surface, field, focus, muted, danger, separator, and accent-soft tokens
- center the command palette and keep its global overlay above the app titlebar
- remove unused shadcn-era local UI compatibility files and old dependencies after import checks
- unify page and inline loading states with HeroUI `Skeleton`
- preserve filesystem-backed markdown notes and debounced autosave while leaving rich editor internals for the dedicated editor milestone

Validation:

- web focused interaction tests passed
- web production build passed
- Go service tests passed
- Go vet passed

Notes:

- The text editing area remained intentionally lightweight at the end of this milestone. Dao later selected Tiptap for the dedicated rich Markdown editor milestone.
- Remaining visual QA should happen as part of normal feature work rather than blocking the HeroUI foundation migration.
- This foundation was later superseded by the shadcn + Base UI migration below.

## Foundation Migration: shadcn Base UI

(Originally scoped with Lisse smooth corners; Lisse was later removed — see the direction note below.)

Status: complete

Branch:

```txt
codex/migrate-heroui-to-shadcn
```

Goal:

```txt
Move the renderer from HeroUI to shadcn preset b1D0eTD6 backed by Base UI,
while preserving Dao's jade accent and Funnel Sans typography.
```

Direction:

- use `base-mira`, the Base UI variant of preset `b1D0eTD6`
- use `@base-ui/react` and Base UI `render` composition; do not use Radix or `asChild`
- keep `cmdk` as the command palette interaction core through the shadcn `Command` component
- replace hugeicons with Tabler Icons
- preserve the existing jade accent and Funnel Sans Variable
- ~~use `@lisse/react` for every visible rounded surface instead of CSS border radii~~ **reversed during this branch**: Lisse clip-path corners cropped element borders and focus rings, so Dao removed `@lisse/react` and standardized on a shared CSS radius token scale (`--radius-*` theme tokens, `rounded-*` utilities, and the `corner` prop API in `apps/web/src/lib/corners.jsx`)
- keep product composition in app and feature code while maintaining shadcn source locally

Migration scope:

- app titlebar, tab bar, sidebar, search, workspace switcher, onboarding, and project content surface
- project tree and task panel menus, dialogs, forms, tables, selects, and loading states
- command palette shell and keyboard hints
- note editor shell and Markdown toolbar controls
- extension-owned icons and React-component boundary validation
- removal of HeroUI, hugeicons, Radix, and unused font dependencies after residual scans

Validation:

- focused component and interaction tests
- full renderer lint, test, and production build
- shadcn project info must report `base: "base"` and preset `b1D0eTD6`
- production source scans must find no HeroUI, hugeicons, Radix, `asChild`, or CSS radius usage

## Milestone 9: Product Shell

Status: complete

Branch:

```txt
feat/product-shell
```

Goal:

```txt
Dao starts moving from functional test panels to a real product workspace experience.
```

Completed scope:

- replace the stacked all-surfaces page with route-like active surface navigation
- add a fixed app titlebar with sidebar toggle and global search
- add a resizable sidebar that can be hidden with a GSAP-assisted reveal/collapse animation
- keep the main sidebar navigation focused on Tasks and Settings
- render projects as folders in the sidebar file tree
- render project notes under their project folder and unassigned notes at the workspace root
- add file-tree context menus for opening, creating, renaming, and deleting projects and notes
- open project folders into a project contents surface
- open notes from the file tree into the note editor surface
- add runtime-only global workspace tabs for tasks, settings, projects, and notes
- keep workspace switches from showing resource tabs that belong to another workspace
- keep page title/header areas fixed while scrollable content stays inside the active surface
- add a settings surface with iOS-style sections for storage and debug actions
- add full-window onboarding for first working directory selection and first workspace creation
- add replay onboarding from Settings
- add a development-only Go service restart action through the desktop preload bridge
- preserve existing API contracts and MVP create/list behavior while reorganizing the UI
- avoid AI features until the product shell can carry existing local context clearly

Keep deferred:

- a real Dashboard/home surface
- richer project detail editing
- route capability support in the extension registry
- browser-level visual QA across desktop and narrow viewports
- persisted tabs or route restoration
- AI features

## Current Milestone: Tiptap Markdown Rich Editor

Recommended branch:

```txt
feat/tiptap-editor
```

Goal:

```txt
Dao replaces the temporary markdown textarea with a Tiptap rich-text editor while keeping Markdown files as the only durable note body format.
```

Planned scope:

- preserve the existing note shell, breadcrumbs, title editing, save status chip, loading skeleton, and error state
- keep the Go file-backed note content API unchanged: React receives Markdown and sends Markdown back
- parse Markdown into Tiptap's document model only in renderer memory; never persist Tiptap, ProseMirror, JSON, or HTML as the note body
- isolate Tiptap behind a Dao-owned Markdown editor component so note loading and persistence remain editor-agnostic
- lazy-load Tiptap in the note body so the title and note shell render without adding ProseMirror to the main application chunk
- serialize title and content autosaves per note, flush the latest draft on switch or close, and drain pending saves before restarting the Go service
- keep failed-save behavior intact so unsaved editor state is not lost
- add a focused formatting toolbar, keyboard-friendly editing, and Dao theme integration
- expose Paragraph and H1-H6 through one block-type selector; keep low-frequency dividers, remote image references, and GFM tables in a compact Insert menu
- keep local image attachments deferred until the Go file layer owns asset copying and note-relative path resolution
- support the initial Markdown subset with explicit round-trip tests, including headings, emphasis, links, lists, task lists, blockquotes, code, tables, dividers, and images
- require real Tiptap-to-Markdown autosave coverage and a second-round-trip idempotence check before merge
- treat Tiptap Markdown support as a compatibility boundary because `@tiptap/markdown` is currently beta and semantic round trips may normalize source formatting
- fall back to a safe Markdown source editor when frontmatter, raw HTML, HTML comments, reference definitions, or footnote definitions would otherwise risk silent loss
- keep CodeMirror or another dedicated source editor available as a later enhancement if the fallback experience needs richer source editing
- keep AI features deferred

Architecture decision:

- [`docs/adr/0001-tiptap-markdown-editor.md`](./adr/0001-tiptap-markdown-editor.md)

## Milestone: Recent-first coss Workspace Shell

Status: complete

Branch:

```txt
feat/greenfield-coss-ui
```

Completed scope:

- replace the previous titlebar, runtime tabs, project surface, dashboard assumptions, and legacy shell UI from zero
- adopt coss + Base UI primitives through the `@coss` registry and keep Tabler Icons
- add Electron `-electron-corner-smoothing: system-ui` alongside the shared radius scale
- use an edge-to-edge macOS system-material sidebar without internal separators
- expose Home, Tasks, disabled Chats, Search, and Activity as compact primary navigation
- make Home restore the latest valid Recent instead of rendering a standalone dashboard
- validate renderer-owned, workspace-scoped Recent state with Zod and prune missing entities
- idempotently create and open a root `Welcome Note.md` after first working-directory setup
- represent persisted projects only as folders in the unified workspace file tree
- reveal project folders from Search without navigating to a project page
- rebuild Tasks, Search, Activity, Settings, command palette, onboarding, note workspace, and Info/Activity inspector UI
- keep the Tiptap-to-Markdown compatibility boundary and ordered autosave queue intact
- remove `cmdk`, GSAP, Funnel Sans, legacy app shell components, legacy product surfaces, and their obsolete tests
- preserve the Electron preload and Go/SQLite/API architecture boundaries

Validation:

- renderer formatting, lint, 104 tests, and production build pass
- Go `test ./...` and `vet ./...` pass
- browser and real Electron visual QA are recorded in project-root `design-qa.md`

Chats remained a disabled placeholder until the milestones below.

## Milestone: AI Summary Loop

Status: complete

Branch:

```txt
feat/ai-harness
```

Completed scope:

- reach a model through one interface and two wire protocols, Anthropic and OpenAI-compatible, so a vendor is a base URL, a key and a model name
- keep the model credential out of the database and out of the renderer: the desktop process holds it in the OS keychain and hands it to the service through the environment, and the service never writes it down, logs it, or returns it
- carry a credential that can renew itself, so an OAuth token refreshes across sleep without restarting the service
- let an endpoint declare that it needs no credential, for a local model
- record every run in an execution trace, including the ones that failed
- gather one day of a workspace and summarise it, validating the answer against a schema before anything is shown
- require confirmation before a summary is kept, and write the note from the trace rather than from the renderer's copy
- deliver an answer while it is still being written

## Milestone: Chats

Status: complete

Branch:

```txt
feat/chat
```

Completed scope:

- keep a conversation as rows in the order it happened, with turn order as a column rather than an inference from a second-precision timestamp
- answer a turn over a server-sent event stream that always ends the same way, so what the client holds after the stream is what a reload shows
- render a reply's Markdown without ever building HTML from it, then move that to markstream and give it the note editor's look
- offer the model the workspace's notes and tasks through read-only tools, bound to one workspace with no argument that could name another
- run the agent loop: ask, run what the model asks for, ask again, bounded
- record what the model looked up on the turn it looked it up for, so a reload still answers "did it read my notes?"
- let a reply be stopped, and record that as stopping rather than as a failure
- put conversations in the search index, both sides of them

Also in this branch:

- make the foreign keys six migrations declare actually hold, by opening the database with them enforced
- set the interface in Iosevka Aile and code in Iosevka Extended, bundled rather than assumed

Validation:

- Go `test ./...` and `vet ./...` pass; renderer formatting, lint, tests and production build pass
- each milestone verified against a copy of the real database, with a fake provider standing in for the model
- browser visual QA in both appearances

## Milestone: The Workspace Folder

Status: complete

Branch:

```txt
feat/workspace-folder
```

Goal:

```txt
The folder and the app describe the same thing, whichever one you change.
```

Everything before this treated the folder as somewhere the app kept its output. A
note was a row that happened to have a file. That reading held only while nothing
else touched the folder, and it broke in every direction at once: files carried
identifiers nobody could read, edits made elsewhere were invisible until a restart
and then silently overwritten, deleting a note left the file behind, and deleting a
folder left the whole directory. The app was not wrong about its rows. It was wrong
about what a note is.

The file is the note. Everything below follows from taking that literally.

Completed scope:

- name files after their titles, with a number for a collision, so what is in the folder is readable by a person and not only by the app; migrate the existing ones, deepest first, rewriting the stored paths of everything underneath
- watch the workspace folder, debounced, and tell the difference between somebody else's edit and the app's own save by comparing file mtime against the row's `updated_at`
- reconcile what the watcher reports, in five cases and no more: a file edited elsewhere refreshes its note and reindexes it, a file gone forgets it, a file back at a deleted note's path revives that note rather than adopting a duplicate of it, a file nobody knows about becomes a note titled from its name, and anything else does nothing
- refuse a save that would write over an edit made in another program: the caller sends what it read, the service compares it against both the row and the file's mtime, and answers a mismatch with 409 and the text on disk
- answer that refusal in the editor as news rather than as an error, with keep mine, take theirs, and show both — because choosing against a version you cannot see is a coin toss dressed as consent
- tell the window when the folder changed, over one server-sent event stream carrying no payload, so the renderer refetches what it needs instead of trusting a second description of the same data
- delete the file when the note is deleted, and say before the button is pressed that it does not go to the Trash
- empty a folder onto the workspace root before removing it — notes with their files, subfolders whole — and refuse, by the name of what is in the way, when it still holds something the app did not put there

Also in this branch:

- give the shell a height instead of a minimum, so that every `overflow-auto` beneath it has a bounded box to scroll inside; the editor, Today, Search, Chats and the sidebar were all inert for the same reason
- move the conversation list into the app's own sidebar, replacing Recents and the workspace tree while Chats is the active view, and lift the list and the selection into a provider the sidebar and the pane share
- open the window at a size capped to a fraction of the display, rather than at very nearly the display
- pull the interface's letter spacing in by 2%

What this milestone is worth remembering for:

- **Filesystem work goes before the commit.** A rename or a removal that fails aborts the transaction and reports it, with nothing destroyed. The reverse order — commit, then touch the disk — means a failure leaves the app describing a folder that is not there, which is the one outcome every confirmation dialog rules out.
- **`os.Remove`, never `os.RemoveAll`.** A folder that is still not empty after the app takes its own things out is holding something the app did not put there. Refusing is an answer somebody can act on; recursively deleting their file because it was in the way is not.
- **Derived beats cleared.** State that carries what it belongs to — a transcript that knows its conversation, a list that knows its workspace — answers "is this still current?" on the render it happens. An effect that clears answers one render late, which is long enough to show one conversation's turns under another's title.
- **A second row for one file is worse than a wrong row.** It splits the note's identity, and every link, recent and search result goes on pointing at the half nothing can reach.

Validation:

- Go `test ./...` and `vet ./...` pass; renderer formatting, lint, 257 tests and production build pass; 92 desktop tests pass
- each part verified against the running app and the real workspace folder, including the failure paths: a save refused with the text on disk while the file was left as the other program wrote it, a folder delete refused by the name of a stray PDF with nothing moved on either side, and a note whose file could not be removed left intact along with its file

## Milestone: Tools That Write

Status: complete

Branch:

```txt
feat/ai-write
```

Goal:

```txt
The model can propose a change to a note or the task list, and a human agrees to it before anything is written.
```

### Decisions taken, so they are not reopened

- **Targeted replace**, not a whole new body. The model sends `old_text` and `new_text`, and the change is refused unless `old_text` appears exactly once. Chosen knowing a small local model gets exact quoting wrong often; the answer to that is the recovery path below, not a different shape.
- **Confirmed inline in the transcript**, where it was asked for, rather than in the note editor or a separate queue.
- **The model finds out.** Answering a change carries the turn on, so it can check its work or follow up. This is why the transcript had to become replayable.
- **Saying something else abandons a waiting change.** Not a convenience: an unanswered tool call cannot be replayed, so without it the next message fails on the wire.
- **A turn has a step ceiling of its own** (`maxTurnSteps`, 16), because a continuation handed the loop's full bound again makes propose-apply-propose-apply endless.

### Completed scope

The service:

- a stored tool call carries the model's id, the tool's output, and `ok` / `failed` / `pending`, and `BuildContext` replays calls with the results that answer them — a call with no id or no result is dropped rather than sent half-formed
- `proposals`: a change worked out and not made, keyed to the conversation and to the model's own call id, holding both texts and the `updated_at` it was worked out against
- `agent.ErrAwaitingApproval` stops the loop; a tool now receives the whole `agent.Call`, because one that waits has to record something findable later
- `internal/diff`: line-level LCS, common ends trimmed first
- `edit_note`: exactly-one-match, and a miss is answered with the line the model was reaching for, found by flattening whitespace on both sides — the failure it cannot see by re-reading its own attempt
- `POST /api/chats/{id}/proposals/{proposalId}` applies or discards from the stored row, answers the waiting call, and runs the loop again over the mended transcript
- every proposal that leaves the repository carries its comparison, computed by `internal/diff` on the way out — the loose end that had `internal/diff` written, tested and called by nothing
- a proposal's status records what happened rather than what was asked for: an apply the note refused lands as `failed`, which is neither `applied` nor `discarded`
- both streams say where a change now stands — the one that follows a decision, and the one that follows somebody talking past it — through the `proposal` event that already existed

The interface:

- a card in the transcript under the turn that asked for it, joined on the model's own call id: the note's title, the comparison, Discard and Apply
- the comparison is drawn from what the service sent, never recomputed here, and long stretches of untouched text are folded into a count rather than dropped
- read back with the conversation, so a change nobody answered is still waiting after a reload and one somebody answered still says so
- a decision streams the continuation into the same conversation, through the same reader a message uses — the two ways a turn can start now share everything after the request is opened
- sending something else instead of answering sets the waiting change aside on this side too, because the service sends the row it set aside
- an answered card says what was recorded, including a write that was refused; a status this build does not recognise is still answered, and does not come back offering the buttons a second time

### What this milestone is worth remembering for

- **The picture and the change are one thing, or the confirmation is theatre.** The comparison is computed once, by the code that owns the two texts, and travels with the row that applying will write. A second implementation in the renderer would agree with it almost always, and the times it did not would be exactly the times somebody agreed to something else.
- **Say what the person did, not what became of their file — unless somebody wrote down what became of the file.** The card says "You applied this change" because that is the part it witnessed. It took a second pass to notice that the row was not saying even that much: it recorded the decision, so a change the note refused sat there marked `applied`. With a `failed` status the write's own answer outlives the turn, and the card can state it without guessing. The rule is not that a surface should be vague; it is that it must not assert what nobody told it.
- **A field that is absent says absent.** The continuation's `start` event used to carry a zero-valued user turn, which the client would have had to recognise as meaning nobody spoke. A pointer and `omitempty` say it on the wire instead.
- **Optimism that can be replaced by a sentence from the other side should be.** The card was settled locally on the `start` event, timed to the moment the service commits — which was the right timing for the wrong idea. The pane knows which decision it sent and never knows what came of it, so the guess was wrong in precisely the case that mattered. The stream now carries the row the service wrote, through the event the card was already listening to, and both guesses went away rather than being corrected. Timing a guess well is worth much less than not having to guess.
- **Eliding is the interface's job, and only the interface's.** The service sends every line because it cannot know how wide the pane is; a diff that had already dropped its context could not be asked for it back.

### Validation

- Go `test ./...` and `vet ./...` pass; renderer formatting, lint, 285 tests and production build pass; 92 desktop tests pass
- the wire the two halves meet on is tested from the service side: the change goes out before the turn it belongs to, the conversation comes back carrying it with its comparison, the transcript holds the call the card joins on, and a continuation nobody started carries no user turn
- the paths that must not move the card were checked by breaking them: a decision the service refused leaves the change waiting, and a message sent instead of an answer sets it aside
- the status fix was checked the same way: with the write's answer ignored again, a refused apply is recorded as `applied`, and with each stream's `proposal` event removed the card is never told what became of the change
- `vite.qa.config.js` grew a conversation stopped on a change, a live turn that proposes one, and a resolve route that answers in the service's order — exercised over HTTP, including answering the same change twice, and refusing to apply the seeded change so the third state can be looked at at all
- not done: the browser visual pass, and a run against a real provider in the Electron shell

### After that

`create_note`, `edit_tasks` and `rename`/`move`/`delete` — the same machinery pointed at different targets, each needing its own confirmation because there is no diff to draw for a note being created and no content to compare for one being renamed.

## Milestone: The Other Four Tools

Status: complete, apart from the same two gaps the last one left.

`create_note`, `edit_tasks`, `rename_note` and `delete_note`. The machinery from the last milestone pointed at four more targets — which is the whole claim being tested here, and it mostly held.

### Decisions

**One shape for a proposal, whatever kind of change it is.** What a tool recorded used to be edit-shaped: a note id and two texts, with nothing saying what sort of change it was, because there was only one sort. Every one of the five is still the same two things — something to show, and enough to perform it with — so it became one struct with a kind, and one `Propose` on the workspace instead of one function per tool. What a caller has to have thought about is confirmation, and that is a single question. Five nilable fields would have been five chances to leave one out.

**A creation has no before and a deletion has no after, and both are the empty string rather than a flag.** This is where the previous milestone's premise turned out to be wrong. It had recorded that "there is no diff to draw for a note being created" — but `split("")` is nil, so the comparison drawn from an empty before is every line marked as arriving, and from an empty after every line marked as going. Both are exactly the right picture, and neither needed a special case. The generalisation cost nothing because the two texts were already the honest representation.

**A rename compares the titles, not the note.** The two texts are the thing being changed, and a rename changes a name. Putting the body in them would draw a picture of something the tool does not touch.

**A deletion is checked against the text that was shown, not against a timestamp.** The one change with nothing to undo it. What the person agreed to losing is what was on the card, so a note edited in between holds something they were never shown and never said yes to — and that is a refusal, not a stale-write conflict to be resolved.

**A created note lands at the workspace root.** Which folder something belongs in is a judgement about how a person keeps their own work. The model cannot see the folders, and a note in the wrong place is one drag from the right one.

**The button says what it is about to do.** "Apply" is a fair word for a change to some text and a poor one for losing a note, and a person scanning a transcript reads the button before the heading. So the confirm label, the icon, and the line that says what has not happened yet are all per kind — "Nothing has been written yet" is no comfort to somebody looking at a deletion. Delete is the only one that gets the destructive colour, and it is still the second button rather than the first.

### What this milestone is worth remembering for

- **A generalisation that costs nothing is evidence the first shape was right.** Four tools were added and the proposal row, the diff, the card, the stream, the resolve path and the status rules all took them without modification. The only new code on the interface side is vocabulary — labels, icons, one sentence per kind. That is the return on having made the first one carry its comparison and its two texts rather than an edit-shaped payload.
- **A premise recorded in a log is still a premise.** "There is no diff to draw for a note being created" was written down as settled and was simply false; the code that would have proved it wrong already existed. Worth checking the claims a milestone inherits before designing around them.
- **The irreversible one deserves different words, not just a different colour.** Everything else about a deletion card is shared with the other four. What is not shared is what it is safe to promise, and that is a sentence, not a style.

### Validation

- Go `test ./...`, `vet ./...` and `gofmt` clean; renderer lint, formatting, 288 tests and production build pass
- each tool refuses what it cannot honestly propose: an empty note, a title that spans lines or runs past 120 characters, a rename to the name it already has, a deletion of a note that is not there
- the title rule is enforced in `create_note` and `rename_note` from one function, because a rule applied in one of two places is a rule with a way around it
- `vite.qa.config.js` reaches all five kinds on a word in the message — rename, delete, create, tasks, change — each verified over HTTP to produce its own kind
- not done, and carried over: the browser visual pass, and a run against a real provider in the Electron shell. Both are now worth more than they were, since there are five cards to look at instead of one
