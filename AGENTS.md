# AGENTS.md

## 1. Project Overview

Dao is an AI-native, local-first personal workspace for developer growth.

It helps developers manage:

- projects
- tasks
- notes
- learning records
- development workflows
- long-term technical growth
- future AI context

Dao starts from the student developer stage and should continue to be useful after the user becomes a professional developer.

The product name “Dao” comes from the Chinese concept of “道”, meaning path, principle, method, order, discipline, and long-term practice.

## 2. Current Technical Direction

Primary stack:

```txt
Electron + React + JavaScript + Go + SQLite
```

Important choices:

- JavaScript is used instead of TypeScript.
- React runs in the Electron renderer.
- Electron is used as the desktop shell.
- Go local service owns business logic and persistence.
- SQLite is the first local database.
- Zod validates runtime data at system boundaries.
- JSDoc documents object shapes in JavaScript.
- Cloud sync is deferred.
- AI Agent features are deferred until core data exists.

## 3. Architecture Boundary Rules

Keep these boundaries strict.

### React Renderer

React should handle:

- UI rendering
- user interactions
- page routing
- local UI state
- API calls
- command palette
- extension UI
- Zod validation of API responses

React should not contain core business logic.

### Electron Main

Electron should handle:

- app lifecycle
- window creation
- preload setup
- starting/stopping the Go service
- native menus
- future auto update
- future tray integration

Electron Main should remain thin.

Do not place product business logic in Electron Main.

### Go Local Service

Go should handle:

- business logic
- SQLite access
- migrations
- local HTTP API
- search
- local file operations
- future AI workflows
- future sync engine

### SQLite

SQLite should handle:

- local persistence
- offline-first data
- full-text search with FTS5
- sync-ready metadata

## 4. Communication Model

Use local HTTP API between React and Go.

```txt
React Renderer
  ↓ HTTP
Go Local Service
  ↓ SQL
SQLite
```

Electron starts the Go service and passes the API base URL and session token to React through preload.

Security rules:

- local service must listen only on `127.0.0.1`
- generate a session token at startup
- all local API requests must use `Authorization: Bearer <token>`
- keep `contextIsolation` enabled
- keep `nodeIntegration` disabled
- expose only minimal APIs through preload

## 5. Repository Structure

Expected structure:

```txt
dao/
  apps/
    desktop/
      electron/
        main/
        preload/

    web/
      src/
        app/
        pages/
        components/
        layouts/
        features/
        extensions/
        lib/
        schemas/
        styles/

    local-service/
      cmd/
        dao-service/
      internal/
        app/
        db/
        modules/
        services/
        search/
        ai/
        sync/
        files/
      migrations/
      sql/

  packages/
    shared-schemas/
    ui/
    extension-sdk/

  extensions/
    notes/
    tasks/
    projects/
    interview/
    leetcode/
    github/

  docs/
    vision.md
    product-plan.md
    architecture.md

  scripts/
  .github/
  README.md
  AGENTS.md
```

## 6. Coding Style

### JavaScript

Use modern ESM syntax:

```js
import { something } from './something.js'
```

Use JSDoc for important shared data structures.

Use Zod for runtime validation at boundaries.

Avoid large files. Split feature code by domain.

Recommended frontend feature structure:

```txt
features/tasks/
  api.js
  schemas.js
  components/
  pages/
  hooks/
```

### Go

Keep Go code organized by responsibility.

Prefer clear service/repository boundaries.

Suggested pattern:

```txt
internal/modules/tasks/
  handler.go
  service.go
  repository.go
  model.go
```

Use standard Go formatting.

Start the local HTTP API with the Go standard library `net/http`.

Use small internal helpers for common HTTP behavior, such as JSON responses and error responses.

Consider switching to `chi` when:

- route groups become repetitive
- path parameters are needed across multiple modules
- authentication middleware is introduced
- request logging or recovery middleware is needed
- handlers start doing too much manual routing work

Prefer `chi` over heavier frameworks such as Gin, Echo, or Fiber for the local service.

Run:

```bash
gofmt
go test ./...
go vet ./...
```

## 7. Data Model Rules

All core tables should include sync-ready fields:

```txt
id
workspace_id
created_at
updated_at
deleted_at
version
sync_status
```

Use soft delete with `deleted_at` where appropriate.

Use ULID for IDs.

Use explicit status values.

Example task status:

```txt
todo
doing
done
archived
```

Example project status:

```txt
active
paused
completed
archived
```

## 8. Validation Rules

Because the project uses JavaScript, all cross-boundary data must be validated.

Use Zod for:

- API request payloads
- API responses
- Electron preload payloads
- extension manifests
- AI outputs
- import/export files

Do not use Zod for every tiny UI state object.

Boundary validation is required.

## 9. Extension Rules

Dao uses official built-in extensions first.

Do not implement a third-party plugin marketplace in the early stage.

Frontend extension interface should support:

- routes
- sidebar items
- commands
- settings later

Backend module interface should support:

- route registration
- migrations
- services
- future jobs

Keep extensions modular but simple.

## 10. AI Feature Rules

Do not build AI Agent features before core data exists.

AI features should be added in this order:

```txt
1. summaries
2. local retrieval
3. tool calling
4. agent workflows
```

AI should work with Dao context:

- notes
- tasks
- projects
- activity logs
- extension data

AI output must be validated with Zod before being used.

Major AI-generated changes should require user confirmation before writing to Dao.

## 11. MVP Scope

The MVP includes:

- workspace
- project
- task
- note
- search
- command palette
- activity log
- settings

The MVP excludes:

- AI Agent
- cloud sync
- third-party plugin marketplace
- mobile app
- collaboration
- GitHub integration
- LeetCode integration
- auto update

## 12. Development Order

Follow this order unless there is a strong reason to change it:

```txt
1. docs
2. React + Vite app
3. Electron shell
4. Go local service
5. health check
6. SQLite migration
7. workspace API
8. workspace UI
9. project API and UI
10. task API and UI
11. note API and UI
12. search
13. command palette
14. activity log
15. extension registry
16. AI features
```

## 13. Commands

The exact commands may change as the repository evolves.

Expected commands:

### Root

```bash
pnpm install
pnpm dev
pnpm lint
pnpm test
pnpm build
```

### Web

```bash
cd apps/web
pnpm dev
pnpm lint
pnpm test
pnpm build
```

### Desktop

```bash
cd apps/desktop
pnpm dev
pnpm build
```

### Go local service

```bash
cd apps/local-service
go run ./cmd/dao-service
go test ./...
go vet ./...
```

## 14. Testing Expectations

When adding a feature, include tests for:

- schema validation
- API client behavior
- Go service logic
- repository behavior
- important UI interactions

For early MVP, prioritize:

- Go repository tests
- Go API handler tests
- Zod schema tests
- command palette tests
- basic workspace/project/task/note flows

## 15. Documentation Rules

Update docs when changing:

- architecture boundaries
- database schema
- API contracts
- extension system
- AI workflow
- security model

Important docs:

```txt
docs/vision.md
docs/product-plan.md
docs/architecture.md
README.md
AGENTS.md
```

Use ADRs for major decisions.

Suggested ADR path:

```txt
docs/adr/
```

## 15.1 Collaboration Rules

When the user is learning or explicitly asks for guidance, explain the next implementation steps and let the user edit code manually.

When project documentation needs to be updated because of architecture decisions, workflow rules, or collaboration agreements, update the relevant documentation directly.

Provide version-control guidance during development:

- suggest when to create a feature branch
- suggest when to commit
- suggest commit messages
- suggest when a branch is ready to merge
- recommend checks to run before merging
- call out when a change should be split into a separate branch or commit

## 16. Git Commit Style

Use Conventional Commits.

Examples:

```txt
feat: add workspace creation api
fix: handle empty project list
docs: add architecture overview
refactor: split task service
test: add workspace repository tests
chore: configure electron-vite
```

## 17. Code Review Checklist

Before considering a feature complete, check:

- feature respects architecture boundaries
- no business logic in Electron Main
- API payloads are validated
- Go service owns persistence logic
- database migration is included
- empty/loading/error states exist
- tests are added or updated
- docs are updated when needed
- naming is consistent
- feature does not expand MVP scope unnecessarily

## 18. Product Voice

Dao should feel calm, focused, and crafted.

Avoid copywriting that feels:

- overly hype-driven
- generic AI startup
- productivity cliché
- culturally stereotyped

Preferred tone:

```txt
calm
precise
developer-native
long-term
thoughtful
```

## 19. Current Priority

The current highest priority is:

```txt
Build the smallest Electron + React + Go + SQLite loop.
```

The first technical milestone:

```txt
Dao desktop app starts.
React renders the app.
Go service starts.
SQLite stores a workspace.
React displays that workspace.
```

Do not prioritize AI, cloud sync, or extensions before this loop works.

## 20. Non-goals

Do not implement these in the early stage:

- third-party plugin marketplace
- complex multi-agent system
- team collaboration
- real-time sync
- Kubernetes
- microservices
- full OAuth account system
- mobile app
- heavy analytics
- social features

Keep Dao focused on becoming a reliable local-first developer growth workspace.
