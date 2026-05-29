# Open Source Strategy

Dao is the primary product.

Companion open-source projects should grow from real engineering needs inside Dao. They should not be created only to increase repository count or make the GitHub profile look busy.

## 1. Principle

```txt
Dao first. Packages later.
```

Every companion project should come from Dao’s real implementation needs.

A package should only be extracted when it has been used inside Dao, has a clear boundary, and can provide value outside Dao.

## 2. Why This Matters

Dao is a long-term product.

Companion open-source projects can help show:

- engineering judgment
- reusable abstraction ability
- package design ability
- documentation ability
- long-term maintenance ability
- real self-use validation through Dao

They can also become a distraction.

The goal is to create useful infrastructure from real needs.

## 3. Extraction Criteria

A module can become an independent open-source project only when:

- it is already used in Dao
- it solves a real repeated problem
- it has a stable API boundary
- it can run outside Dao
- it has documentation
- it has at least one working example
- maintaining it will not slow down Dao MVP
- it can be explained clearly in a README within 3 minutes

## 4. Recommended Process

Companion projects should go through three stages.

### Stage 1: Internal Package

Start inside the Dao monorepo.

```txt
packages/
  electron-go-bridge/
  ui-desktop/
  command-kit/
  extension-sdk/
```

The goal is to validate the package through real Dao usage.

### Stage 2: Documented Internal Package

Before extracting, add:

- README
- examples
- tests
- changelog
- clear public API
- known limitations

### Stage 3: Independent Open-source Project

Extract only after the package becomes stable enough.

Possible targets:

```txt
github.com/nichijousong08/electron-go-bridge
github.com/nichijousong08/jade-ui
github.com/nichijousong08/dao-command-kit
```

## 5. Candidate Projects

## 5.1 electron-go-bridge

A utility for launching and managing a Go local service from Electron.

### Problem

Dao uses Electron as the desktop shell and Go as the local service.

Electron needs to:

- start the Go binary
- find an available local port
- wait for health check
- inject API base URL
- inject session token
- clean up the child process
- support both development and production paths
- work across macOS and Windows

### Potential Features

- start Go binary from Electron
- find available localhost port
- wait for `/health`
- manage process lifecycle
- inject API base URL into preload
- inject session token
- handle app quit cleanup
- support dev/prod binary paths
- support logging and diagnostics

### Priority

```txt
High
```

### Why It Has Value

This solves a specific engineering problem that other Electron + Go projects may also face.

It is concrete, searchable, and easy to understand from a README.

## 5.2 Jade UI

A compact React UI kit for developer tools, extracted only after Dao validates real product composition patterns on top of HeroUI and Tailwind CSS.

### Problem

Dao needs a distinctive UI system that avoids generic dashboard sameness while keeping accessibility and development speed.

### Potential Features

- design tokens
- accessible components
- dark mode
- compact density
- command palette
- sidebar
- panel
- dialog
- dropdown
- input
- button
- badge

### Priority

```txt
Medium High
```

### Why It Has Value

It shows design system ability, React component abstraction, accessibility awareness, and real usage in Dao.

This project should become a focused component system for developer tools.

It should not be extracted while Dao is still deciding its core UI patterns. The app should first validate direct HeroUI usage, Dao design tokens, density, forms, command palette, sidebar, panel, and dialog patterns in real product surfaces.

This should not become a wrapper package that merely hides HeroUI. Extract only product-specific composition, density, styling, and interaction patterns that prove reusable through repeated Dao usage.

## 5.3 dao-command-kit

A command registration and execution layer for keyboard-first applications.

### Problem

Dao depends heavily on command palette interactions.

The same command system may power:

- command palette
- shortcuts
- extension commands
- AI tools later

### Potential Features

- command registry
- command groups
- keyboard shortcuts
- async commands
- extension commands
- permission checks
- command metadata
- command search

### Priority

```txt
Medium
```

### Why It Has Value

Keyboard-first interaction is important for developer tools.

A clean command system can be reused in other desktop or web productivity apps.

## 5.4 dao-extension-sdk

A lightweight extension SDK for Dao-style modular applications.

### Problem

Dao uses a Core + Extensions architecture.

The extension system needs stable contracts for:

- routes
- sidebar items
- commands
- settings
- permissions
- manifests

### Potential Features

- route registration
- sidebar registration
- command registration
- settings registration
- manifest validation
- extension lifecycle hooks
- permission declaration

### Priority

```txt
Medium
```

### Why It Has Value

It demonstrates modular architecture design.

This should remain internal until Dao’s own extension model becomes stable.

## 5.5 dao-ai-harness

A harness layer for AI features inside developer tools.

### Problem

Dao’s AI features should not be random model calls inside UI components.

AI needs a structured layer for:

- context selection
- tool calling
- output validation
- execution trace
- permission control
- user confirmation

### Potential Features

- context builder
- prompt builder
- tool registry
- output schema validation
- execution trace
- human confirmation flow
- permission levels
- recovery hooks

### Priority

```txt
Later
```

### Why It Has Value

This could become valuable after Dao has real AI usage.

It should be proven inside Dao first.

## 6. Non-goals

Do not extract these as companion projects in the early stage:

- custom ORM
- markdown editor
- migration tool
- generic state management library
- Electron packaging tool
- full plugin marketplace
- vector database
- generic AI agent framework
- design system without real Dao usage

These areas are too broad, already mature, or likely to distract from Dao.

## 7. Release Rule

A companion project can be released only when it satisfies:

```txt
Used in Dao
Documented
Tested
Example included
API boundary stable
Maintenance cost acceptable
```

Keep it internal until it satisfies these conditions.

## 8. Naming Guidance

Use names that can stand alone outside Dao.

Good examples:

```txt
electron-go-bridge
Jade UI
command-kit
```

Avoid names that are too broad or misleading.

Examples to avoid:

```txt
ultimate-ui
super-agent
next-framework
```

## 9. Resume Value

A companion project is valuable when it can be described as:

```txt
Extracted from real engineering needs in Dao and continuously validated through production-like usage.
```

Example resume wording:

```txt
Extracted and maintained reusable infrastructure packages from Dao, including an Electron-Go service bridge and a compact HeroUI-based developer-tool UI kit, both validated through continuous use in the main product.
```

The goal is to show engineering judgment, not repository count.

## 10. Current Decision

For the current stage:

```txt
Do not create independent repositories yet.
```

Start with internal packages only.

Recommended first internal packages:

```txt
packages/
  electron-go-bridge/
  ui-desktop/
  design-tokens/
```

The first independent open-source project should be:

```txt
electron-go-bridge
```

Extract it after Dao’s Electron + Go + SQLite loop is working reliably.
