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

Calm **bold**, *italic*, ~~removed~~, and [linked](https://example.com) text.

> Local files stay durable.

- parent
  - child
`);

    expect(output).toContain('# Dao 编辑器');
    expect(output).toContain('**bold**');
    expect(output).toContain('*italic*');
    expect(output).toContain('~~removed~~');
    expect(output).toContain('[linked](https://example.com)');
    expect(output).toContain('> Local files stay durable.');
    expect(output).toContain('- parent');
    expect(output).toContain('  - child');
  });

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
