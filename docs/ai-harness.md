# Dao AI Harness

## 1. Purpose

Dao AI Harness is the future AI execution layer of Dao.

It defines how AI features should collect context, call tools, validate outputs, record execution traces, and request user confirmation.

Dao’s MVP does not include AI features.

This document exists now to define architectural constraints so that future AI features stay structured, safe, and maintainable.

## 2. Core Principle

```txt
No ad-hoc AI calls.
All AI features must go through Dao AI Harness.
```

AI should not be called directly from random React components or feature modules.

AI features should flow through a structured harness layer.

## 3. Why Dao Needs a Harness

Dao is designed around long-term developer growth.

Future AI features will need access to:

- projects
- tasks
- notes
- activity logs
- search results
- extension data
- current workspace
- current page context
- user-selected content

Without a harness, AI logic can easily become:

- hard to debug
- unsafe
- inconsistent
- difficult to test
- difficult to evolve
- scattered across UI components

Harness provides the engineering control layer around AI.

## 4. Definition

In Dao, AI Harness means:

```txt
A structured system around AI models that manages context, tools, permissions, validation, traces, memory, and human confirmation.
```

It is not just a chatbot.

It is the system that turns AI from a text generator into a reliable product capability.

## 5. Relationship to MVP

Dao’s MVP should not implement AI Harness code.

The MVP should only prepare the foundations:

- workspace
- project
- task
- note
- search
- command palette
- activity log
- extension registry

These modules later become inputs to the harness.

## 6. Implementation Timing

Recommended timing:

```txt
Month 1: Electron + React + Go + SQLite
Month 2: workspace / project / task / note
Month 3: search / command palette / activity log
Month 4: extension system
Month 5: minimal AI Harness + AI summaries
Month 6: polish and demo
```

Harness code should start when the first AI feature starts.

Harness documentation can exist from the beginning.

## 7. Harness Architecture

Future structure:

```txt
Dao AI Harness
  ├── Context Layer
  ├── Prompt Layer
  ├── Tool Registry
  ├── Permission Layer
  ├── Memory Layer
  ├── Verification Layer
  ├── Execution Trace
  └── Human Confirmation
```

Suggested Go structure:

```txt
apps/local-service/
  internal/
    ai/
      harness/
        context.go
        prompt.go
        tools.go
        permissions.go
        trace.go
        validation.go
        confirmation.go
```

Suggested frontend structure:

```txt
apps/web/
  src/
    features/
      ai/
        schemas.js
        api.js
        components/
        pages/
```

## 8. Context Layer

Context Layer decides what information should be sent to the model.

Potential context sources:

```txt
current workspace
current page
selected project
selected tasks
selected note
recent activity
search results
extension data
user-selected text
```

Example user request:

```txt
Help me review my Dao project progress.
```

The harness should collect:

- Dao project metadata
- recent tasks
- completed tasks
- related notes
- activity logs
- roadmap context
- relevant architecture notes

## 9. Prompt Layer

Prompt Layer builds structured prompts from:

- user request
- selected context
- system rules
- tool descriptions
- output schema
- permission constraints

Prompt construction should be explicit and testable.

Avoid building prompts directly inside UI components.

## 10. Tool Registry

Tool Registry exposes Dao capabilities to AI in a controlled way.

Example tools:

```txt
searchNotes
getProjectStatus
listOpenTasks
suggestTasksFromNote
createTask
updateTask
createDailyPlan
summarizeProject
```

Each tool should define:

- name
- description
- input schema
- output schema
- permission level
- side effect type
- confirmation requirement

Example tool definition:

```js
const CreateTaskTool = {
  name: 'create_task',
  description: 'Create a task in the current workspace.',
  inputSchema: z.object({
    projectId: z.string(),
    title: z.string().min(1),
    priority: z.enum(['low', 'medium', 'high']),
  }),
  outputSchema: z.object({
    taskId: z.string(),
  }),
  permission: 'write',
  requiresConfirmation: true,
}
```

## 11. Permission Layer

AI tools should be grouped by permission level.

Recommended levels:

```txt
read
suggest
write
```

### read

AI can read existing data.

Examples:

- search notes
- read project status
- list open tasks
- get recent activity

### suggest

AI can generate proposals without writing data.

Examples:

- suggest tasks
- suggest weekly plan
- suggest project improvements
- suggest interview preparation plan

### write

AI can modify Dao data only after user confirmation.

Examples:

- create task
- update note
- archive task
- save project summary
- create daily plan

## 12. Verification Layer

AI output must be validated before use.

Verification includes:

- JSON format validation
- Zod schema validation
- project ID existence
- task ID existence
- duplicate detection
- permission check
- confirmation check
- empty result handling
- error recovery

AI output should never be trusted directly.

## 13. Execution Trace

Every AI execution should generate a trace.

A trace should include:

```txt
id
workspace_id
user_request
selected_context
prompt_version
model
tool_calls
tool_results
validation_result
errors
user_confirmation
final_output
created_at
```

Execution traces help with:

- debugging
- user trust
- product improvement
- AI behavior review
- future memory
- future analytics

## 14. Human Confirmation

Dao should use human-in-the-loop confirmation for write operations.

AI can prepare changes, but users confirm before committing them.

Example flow:

```txt
User: Create a plan for preparing Go backend interviews.

AI:
I suggest creating 5 tasks:
1. Review Go goroutine scheduling
2. Practice SQL indexing questions
3. Review Redis cache patterns
4. Write a project explanation for Dao
5. Do one mock interview

[Confirm and Create Tasks]
[Edit]
[Cancel]
```

Write operations should not happen silently.

## 15. Memory Layer

Memory should be introduced carefully.

Recommended memory levels:

```txt
session memory
project memory
workspace memory
long-term user memory
```

Early versions should only implement:

```txt
project memory
activity-based memory
```

Avoid over-personalized memory before the product has stable AI usage.

## 16. Minimal Harness

The first AI Harness implementation should be small.

For AI Summary features, implement only:

```txt
Context Builder
Prompt Builder
Output Schema
Execution Trace
Human Confirmation
```

Tool Calling can wait.

### Minimal Flow

```txt
User clicks “Summarize Project”
↓
Harness collects project / tasks / notes / activity
↓
Harness builds prompt
↓
Model returns structured output
↓
Zod validates output
↓
Trace is recorded
↓
Result is shown to user
↓
User chooses whether to save summary
```

## 17. First AI Features

Recommended first AI features:

```txt
Summarize Project
Summarize Today
Summarize Note
Generate Tasks from Note
Suggest Weekly Plan
```

These features fit Dao’s product direction and can work with read-only or suggest-only permissions first.

## 18. Tool Calling Phase

After AI summaries work, add Tool Registry.

Recommended first tools:

```txt
searchNotes
listOpenTasks
getProjectStatus
suggestTasksFromNote
```

These tools are low-risk because they are read-only or suggest-only.

Write tools come later.

## 19. Agent Workflow Phase

Agent workflows should be added after:

- core data is stable
- AI summaries work
- tool registry works
- execution traces exist
- confirmation flow works

Example agent workflows:

```txt
Prepare me for a Go backend interview.
Review my Dao project for resume writing.
Plan my development work for this week.
Find gaps in my current learning progress.
```

Agent workflow structure:

```txt
understand goal
retrieve context
create plan
call tools
verify outputs
ask for confirmation
write approved changes
record trace
```

## 20. Integration with Extensions

Extensions may expose tools to the AI Harness.

Example:

```txt
Interview extension
  ├── listInterviewQuestions
  ├── createMockInterview
  └── suggestReviewPlan

LeetCode extension
  ├── listSolvedProblems
  ├── findWeakTopics
  └── suggestPracticeSet

GitHub extension
  ├── listRecentCommits
  ├── summarizeRepository
  └── suggestProjectHighlights
```

Extension-provided tools must follow the same rules:

- schema validation
- permission declaration
- trace logging
- confirmation for writes

## 21. Frontend Rules

Frontend components should not call AI providers directly.

Frontend should call Dao AI APIs, such as:

```txt
POST /api/ai/summarize-project
POST /api/ai/suggest-tasks
POST /api/ai/confirm-action
GET  /api/ai/traces/:id
```

Frontend responsibilities:

- trigger AI action
- show loading state
- show proposed result
- allow user edit
- ask for confirmation
- display errors

## 22. Backend Rules

Go local service owns AI orchestration.

The backend should handle:

- context collection
- prompt building
- model call
- output validation
- tool execution
- trace recording
- confirmation workflow

## 23. Testing Rules

AI Harness should be testable without calling real AI providers.

Use mocks for:

- model response
- tool calls
- context retrieval

Test:

- context builder
- output schema validation
- permission checks
- confirmation flow
- trace creation
- error handling

## 24. Non-goals

Do not implement early:

- multi-agent system
- autonomous database writes
- self-modifying workflows
- custom agent framework
- automatic code editing
- complex long-term memory
- third-party tool marketplace

These can wait until Dao has stable AI usage.

## 25. AGENTS.md Rule

Add this rule to `AGENTS.md`:

```txt
Do not add ad-hoc AI calls directly inside UI components or feature modules. Once AI development starts, all AI features must go through the Dao AI Harness layer.
```

## 26. Current Decision

Current decision:

```txt
MVP does not include AI features.
AI Harness is documented now.
Harness implementation starts when the first AI feature begins.
```

MVP should continue to focus on:

```txt
workspace
project
task
note
search
command palette
activity log
```

These are the future data foundations for Dao AI Harness.
