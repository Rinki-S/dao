export const REFERENCE_DEFINITION_FIXTURES = [
  {
    name: 'standalone link definition',
    markdown: '[dao]: https://example.com\n\nBody',
  },
  {
    name: 'image definition with a title',
    markdown: '![Dao icon][dao-logo]\n\n[dao-logo]: ./dao.png "Dao logo"\n',
  },
  {
    name: 'multiline definition',
    markdown: '[dao]:\n  https://example.com/docs\n  "Dao docs"\n\n[Dao][dao]',
  },
  {
    name: 'three-space-indented definition',
    markdown: '   [dao]: <https://example.com/path?q=1>\n\n[Dao][]',
  },
  {
    name: 'CRLF definition',
    markdown: '[dao]: https://example.com\r\n\r\nBody\r\n',
  },
  {
    name: 'definition nested in a blockquote',
    markdown: '> [dao]: https://example.com\n>\n> [Dao][dao]',
  },
  {
    name: 'definition nested in a list item',
    markdown: '- [dao]: https://example.com\n\n  [Dao][dao]',
  },
];

export const CODE_BLOCK_REFERENCE_LIKE_FIXTURES = [
  {
    name: 'fenced code block',
    markdown: '```markdown\n[dao]: https://example.com\n```',
  },
  {
    name: 'indented code block',
    markdown: '    [dao]: https://example.com\n\nBody',
  },
];

export const FOOTNOTE_DEFINITION_FIXTURES = [
  {
    name: 'GFM footnote definition',
    markdown: 'Body with a footnote.[^dao]\n\n[^dao]: Durable local Markdown.\n',
  },
  {
    name: 'nested footnote definition',
    markdown: '> Body[^1]\n>\n> [^1]: Nested footnote body.\n',
  },
];

export const HTML_LITERAL_FIXTURES = [
  {
    name: 'lowercase doctype in a fenced code block',
    markdown: '```html\n<!doctype html>\n<div>example</div>\n```',
  },
  {
    name: 'HTML comment in an indented code block',
    markdown: '    <!-- example only -->\n\nBody',
  },
  {
    name: 'raw HTML in inline code',
    markdown: 'Use `<details>` when documenting disclosure markup.',
  },
  {
    name: 'footnote-like text in inline code',
    markdown: 'The literal syntax is `[^dao]: example`.',
  },
  {
    name: 'footnote-like text in multiline inline code',
    markdown: '`first line\n[^dao]: example`',
  },
];
