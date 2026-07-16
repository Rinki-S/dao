# ADR 0001: Use Tiptap with Markdown as the Durable Note Format

Status: accepted

Date: 2026-07-15

## Context

Dao stores note bodies as local Markdown files. The temporary note editor exposes that source through a plain textarea, but the product direction calls for a calmer rich-text editing experience without changing the local-first file model.

Tiptap provides a React-friendly rich editor and Markdown parsing and serialization through `@tiptap/markdown`. Its editor state is a ProseMirror document, and its Markdown support is currently beta. A Markdown round trip can preserve meaning while normalizing source details such as list markers, whitespace, or escaping. Unsupported syntax can be lost if it is parsed and serialized without an explicit compatibility boundary.

## Decision

Dao will use Tiptap for the default rich note editing experience under these constraints:

- Markdown is the only durable note body format and remains the source of truth.
- The existing Go API continues to read and write Markdown strings backed by `.md` files.
- Tiptap and ProseMirror document state exists only in renderer memory.
- Dao does not persist editor JSON, ProseMirror JSON, or generated HTML as a second note body.
- The note shell talks to a Dao-owned Markdown editor adapter rather than Tiptap APIs directly.
- Opening a different note creates a fresh editor instance initialized from that note's Markdown.
- The Tiptap editor implementation loads as an async renderer chunk while the note title and shell remain immediately available.
- The first supported Markdown subset is protected by parser, serializer, and editor round-trip tests.
- Dao's serializer removes Tiptap's internal table-cell control separator before persistence, flattening multiple cell blocks to a normal space because GFM tables cannot represent block paragraphs inside one cell.
- Notes containing frontmatter, raw HTML, HTML comments, reference definitions, or footnote definitions use a safe source-editor fallback until those constructs can be preserved deliberately.
- Loading a note must not trigger a write. Only user edits enter the existing debounced autosave flow.
- Title and content writes for one note share a serial save queue. Failed saves retain the current editor state, switching or closing notes flushes the latest pending Markdown, and reopening waits for queued writes before reading the file.

## Consequences

Dao gains a rich editor while keeping files portable, inspectable, and usable outside the application. The Go service, SQLite model, search indexing boundary, and note API do not need a second content representation.

Markdown output is guaranteed at a semantic level for the supported subset, not as a byte-for-byte reproduction of the original source. Compatibility fixtures and real-note regression tests are therefore required before expanding the supported syntax.

The source fallback is part of the data-safety design, not a temporary error state. A richer dedicated source editor, including CodeMirror, can be added later without changing the durable format or the note API.
