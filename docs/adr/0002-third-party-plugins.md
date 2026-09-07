# ADR 0002: Third-Party Plugins

Status: proposed

Date: 2026-09-07

## Context

Milestone 7 built an extension registry and deliberately deferred the hard half of it: dynamic loading, permissions, signing, sandboxing, and distribution. What exists today is a static array of built-in extensions in `apps/web/src/extensions/`, validated with Zod, exposing four capability kinds — commands, sidebar items, surfaces, and content formats.

That registry cannot carry a third-party plugin, and the reason is one line in `schemas.js`:

```js
icon: ReactComponentTypeSchema,
```

A capability today holds **live React component references**. That works because every extension is compiled into the same bundle. Somebody else's plugin cannot hand us a React component unless its code is loaded into our runtime — and once it is, it has everything the app has: the DOM, the service's session token, the workspace folder, and the model API key the desktop process holds.

So this is not a loading problem with a security question attached. It is a trust boundary, and the loading mechanism is downstream of where that boundary is drawn.

What a plugin would be running next to is worth stating plainly, because it sets the bar: somebody's notes and tasks as files on disk, a local service with an authenticated port, and a credential for a paid third-party account. A local-first app makes a plugin more dangerous than a web app's would be, not less — there is no server-side blast radius, only the user's own machine.

## Decision

Five principles. Everything below them is implementation.

### 1. A capability is data, not a function

A plugin declares what it contributes; the host decides how to draw it and what to do when it is chosen. An icon becomes a name from a fixed set, not a component. A command becomes an id and a title, not a handler.

This is what makes the boundary serialisable, and a boundary that cannot be serialised cannot be crossed safely. It also means a plugin that is broken, slow, or uninstalled leaves the interface intact — the host already knows how to render everything it declared.

The existing capability shapes stay. `getRegisteredCommands()` and its siblings merge built-in and plugin capabilities, and the difference between the two lives in how a capability is _invoked_, not in what it looks like.

### 2. Plugin code never runs in the renderer's world

It runs in a hidden `BrowserWindow` with `sandbox: true`, `nodeIntegration: false`, `contextIsolation: true`, and a Content-Security-Policy that includes `connect-src 'none'` — so no `fetch`, no `WebSocket`, no ambient network at all. It talks to the host over a `MessageChannelMain` port and has no other way out.

Chromium's own sandbox rather than a hand-rolled one, because it is the most attacked and most repaired sandbox available and we are not going to do better. A Web Worker was rejected: it shares the renderer process, so a compromise there is a compromise of the app. Electron's `utilityProcess` was rejected: it is a Node process, and keeping `require` away from a plugin means building a restricted module loader, which is exactly the hand-rolled sandbox this avoids.

The cost is honest and should be recorded: a hidden window per plugin is tens of megabytes. That is affordable for a handful of plugins and would not be for fifty. If that ceiling is ever reached, the answer is one window hosting several plugins in separate realms, not weaker isolation.

### 3. A plugin reaches the workspace only through a brokered API

Never the service's port, never its session token, never the folder, never `fs`. The host exposes a small, versioned, asynchronous API over the message port and performs every operation itself:

```txt
notes.list()            tasks.read()
notes.read(id)          tasks.propose(change)
notes.propose(change)   ui.notify(message)
```

Every call is checked against what the plugin was granted before it is performed. The plugin's own honesty is never load-bearing.

### 4. Permissions are declared, granted by a person, and enforced at the broker

A manifest names what the plugin needs — `notes:read`, `notes:write`, `tasks:read`, `tasks:write`, and later `net:<host>` — in the plugin's own words for why. The person grants them at install, sees them in Settings, and can revoke them. A call outside the grant is refused and reported to the plugin as a result it can act on, the way a failed tool is reported to the model.

Network access is not a general permission. A plugin that needs one host gets that host, brokered through the app so the sandbox's CSP stays closed.

### 5. A plugin writes the way the model writes: by proposing

This is the part the codebase has already built. `proposals` holds a change worked out and not made, with both texts, its own comparison computed by the code that owns them, and a card in the interface with Discard and Apply. It was built for the AI milestones and it is exactly the right shape here.

So `notes.propose()` records a proposal and returns when somebody has answered it. A plugin cannot write to a note; it can ask, and a person sees the same diff, on the same card, with the same guarantee that what they agreed to is what gets written.

`notes:write` therefore does not mean "may write". It means "may ask".

## The sequence

Five milestones. The first two are the boundary; the rest are what crosses it.

**A — A plugin is a folder with a manifest.** Discovery from a plugins directory, manifest validation, enable and disable, capabilities merged into the existing registry. Declarative only: a plugin can contribute commands that route to actions the host already has, and sidebar items. **No plugin code runs at all.** Settles where plugins live, what a manifest is, how capabilities merge, and what Settings looks like — without any sandbox existing yet.

**B — A plugin can run code, and can reach nothing.** The hidden sandboxed window, the message port, the lifecycle, and the failure rules: what happens when a plugin throws, hangs, or never answers. A command handler runs plugin JavaScript. It still has no API to call. Settles isolation before there is anything worth stealing.

**C — A plugin can ask, and can be told no.** The brokered read API, permissions in the manifest, the consent prompt, enforcement, and revocation. Reading notes and tasks. Settles the API surface and the permission model against real calls.

**D — A plugin can propose a change.** `notes.propose` and `tasks.propose` onto the existing proposals machinery. The reuse is the point: if a plugin's change needs new confirmation UI, something has gone wrong with the abstraction rather than with the plugin.

**E — A plugin can draw something.** A surface rendered in a sandboxed iframe, given the host's design tokens and nothing else. Deferred deliberately: declarative capabilities cover more than they look like they do, and a plugin that can paint pixels can imitate the app's own dialogs.

Explicitly out of scope for all five: distribution, a marketplace, signing, automatic updates, and review. Installing means pointing at a folder. Those problems are real and none of them are the boundary.

## Consequences

- **The capability schema changes shape.** `ReactComponentTypeSchema` becomes an icon name resolved by the host. Built-in extensions move to the same representation, so there is one kind of capability rather than two — a registry where built-ins are privileged and plugins are second-class would drift, and the privileged path is the one that gets tested.
- **A public API becomes a thing that can be broken.** Once somebody else's plugin depends on `notes.read`, changing it is a breaking change. This is the real cost of the feature, and it is permanent. The API should therefore start smaller than feels useful.
- **Sandboxing arbitrary code is hard, and the failure is somebody's notes and a paid credential.** Milestones A and B exist in that order so the isolation is built and tested before any API is worth attacking.
- **A plugin cannot silently change anything.** Every write is a proposal a person answers, which caps the worst case of a malicious or simply buggy plugin at wasting somebody's time.

## Open questions

- Does a plugin need to run when the app is not looking at it — a background job, a scheduled sync? That would mean a lifecycle beyond "activated by a contribution point", and it is the most likely reason to want a longer-lived process.
- Do plugins need per-workspace enablement, or is it per-installation? Per-workspace is more precise and doubles the state.
- Is JavaScript the only plugin language? A brokered message port over stdio would admit anything, at the cost of the Chromium sandbox.
