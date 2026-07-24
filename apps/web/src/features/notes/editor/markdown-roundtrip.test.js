import { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it } from 'vitest';

import { getDurableMarkdown } from './markdown-serialization.js';
import { createMarkdownEditorExtensions } from './tiptap-extensions.js';

let editor;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

function roundTrip(markdown) {
  editor?.destroy();
  editor = new Editor({
    content: markdown,
    contentType: 'markdown',
    extensions: createMarkdownEditorExtensions(),
  });

  return getDurableMarkdown(editor);
}

describe('Tiptap Markdown round trips', () => {
  it('preserves the supported rich-text semantics', () => {
    const output = roundTrip(`# Dao 编辑器

Calm **bold**, *italic*, ~~removed~~, [linked](https://example.com), and [documented](https://example.com/docs "Dao docs") text.

> Local files stay durable.

- parent
  - child
`);

    expect(output).toContain('# Dao 编辑器');
    expect(output).toContain('**bold**');
    expect(output).toContain('*italic*');
    expect(output).toContain('~~removed~~');
    expect(output).toContain('[linked](https://example.com)');
    expect(output).toContain('[documented](https://example.com/docs "Dao docs")');
    expect(output).toContain('> Local files stay durable.');
    expect(output).toContain('- parent');
    expect(output).toContain('  - child');
  });

  it('preserves every heading level and horizontal rules idempotently', () => {
    const firstOutput = roundTrip(`# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

---

Body
`);

    for (let level = 1; level <= 6; level += 1) {
      expect(firstOutput).toContain(`${'#'.repeat(level)} Heading ${level}`);
    }

    expect(firstOutput).toContain('\n---\n');
    expect(roundTrip(firstOutput)).toBe(firstOutput);
  });

  it.each([1, 2, 3, 4, 5, 6])(
    'serializes the level %i heading command and can restore a paragraph',
    (level) => {
      editor = new Editor({
        content: 'Heading',
        contentType: 'markdown',
        extensions: createMarkdownEditorExtensions(),
      });

      expect(editor.commands.setHeading({ level })).toBe(true);
      expect(getDurableMarkdown(editor).trim()).toBe(`${'#'.repeat(level)} Heading`);

      expect(editor.commands.setParagraph()).toBe(true);
      expect(getDurableMarkdown(editor).trim()).toBe('Heading');
    },
  );

  it('preserves GFM tasks, tables, fenced code metadata, and images', () => {
    const output = roundTrip(`- [x] shipped
- [ ] verify

| Name | Value |
| --- | --- |
| dao | local |

\`\`\`javascript
const path = '道';
\`\`\`

![Dao icon](./dao.png "Logo")
`);

    expect(output).toContain('- [x] shipped');
    expect(output).toContain('- [ ] verify');
    expect(output).toMatch(/\|\s*Name\s*\|\s*Value\s*\|/);
    expect(output).toContain('| dao');
    expect(output).toContain("```javascript\nconst path = '道';\n```");
    expect(output).toContain('![Dao icon](./dao.png "Logo")');
  });

  it('keeps toolbar-safe destinations and optional titles idempotent', () => {
    const firstOutput = roundTrip(`[Dao docs](https://example.com/docs%20%28draft%29 "Draft docs")

![Architecture](https://example.com/diagram%281%29.png "Dao architecture")
`);

    expect(firstOutput).toContain(
      '[Dao docs](https://example.com/docs%20%28draft%29 "Draft docs")',
    );
    expect(firstOutput).toContain(
      '![Architecture](https://example.com/diagram%281%29.png "Dao architecture")',
    );
    expect(roundTrip(firstOutput)).toBe(firstOutput);
  });

  it('keeps an image command with an escaped destination idempotent', () => {
    editor = new Editor({
      content: '',
      contentType: 'markdown',
      extensions: createMarkdownEditorExtensions(),
    });

    expect(
      editor.commands.setImage({
        src: 'https://example.com/diagram%281%29.png',
        alt: 'Architecture',
        title: 'Dao architecture',
      }),
    ).toBe(true);

    const firstOutput = getDurableMarkdown(editor);

    expect(firstOutput).toContain(
      '![Architecture](https://example.com/diagram%281%29.png "Dao architecture")',
    );
    expect(roundTrip(firstOutput)).toBe(firstOutput);
  });

  it('is idempotent after a second Markdown round trip', () => {
    const firstOutput = roundTrip(`# Dao

Calm **bold**, *italic*, ~~removed~~, and [linked](https://example.com) text.

> Local files stay durable.

- parent
  - child

- [x] shipped
- [ ] verify

| Name | Value |
| --- | --- |
| dao | local |

\`\`\`javascript
const path = '道';
\`\`\`

![Dao icon](./dao.png "Logo")
`);

    const secondOutput = roundTrip(firstOutput);

    expect(secondOutput).toBe(firstOutput);
  });

  it('never persists Tiptap table-cell control separators', () => {
    editor = new Editor({
      content: {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
                      { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      extensions: createMarkdownEditorExtensions(),
    });

    const markdown = getDurableMarkdown(editor);

    expect(markdown).toContain('| first second |');
    expect(markdown).not.toContain('\u001f');
  });
});
