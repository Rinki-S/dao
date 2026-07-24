import { describe, expect, it } from 'vitest';

import { getMarkdownCompatibility } from './markdown-compatibility.js';
import {
  CODE_BLOCK_REFERENCE_LIKE_FIXTURES,
  FOOTNOTE_DEFINITION_FIXTURES,
  HTML_LITERAL_FIXTURES,
  REFERENCE_DEFINITION_FIXTURES,
  UNSAFE_QUOTED_TITLE_FIXTURES,
} from './markdown-compatibility.fixtures.js';

describe('getMarkdownCompatibility', () => {
  it('allows the supported CommonMark and GFM subset', () => {
    const result = getMarkdownCompatibility(`# Dao

- [x] local-first

| Format | Durable |
| --- | --- |
| Markdown | yes |

<https://dao.example>
`);

    expect(result).toEqual({ isRichTextSafe: true, reasons: [] });
  });

  it.each([
    ['frontmatter', '---\ntitle: Dao\n---\n\nBody'],
    ['HTML comments', 'Before\n\n<!-- keep this -->\n\nAfter'],
    ['raw HTML', 'Before\n\n<details><summary>More</summary>Text</details>'],
    ['raw HTML', '<!doctype html>\n<html lang="en"></html>'],
  ])('requires source mode for %s', (reason, markdown) => {
    const result = getMarkdownCompatibility(markdown);

    expect(result.isRichTextSafe).toBe(false);
    expect(result.reasons).toContain(reason);
  });

  it.each(REFERENCE_DEFINITION_FIXTURES)('requires source mode for $name', ({ markdown }) => {
    expect(getMarkdownCompatibility(markdown)).toEqual({
      isRichTextSafe: false,
      reasons: ['reference definitions'],
    });
  });

  it.each(FOOTNOTE_DEFINITION_FIXTURES)('requires source mode for $name', ({ markdown }) => {
    expect(getMarkdownCompatibility(markdown)).toEqual({
      isRichTextSafe: false,
      reasons: ['footnote definitions'],
    });
  });

  it.each(UNSAFE_QUOTED_TITLE_FIXTURES)(
    'requires source mode for $name',
    ({ markdown }) => {
      expect(getMarkdownCompatibility(markdown)).toEqual({
        isRichTextSafe: false,
        reasons: ['link or image titles with double quotes'],
      });
    },
  );

  it.each(CODE_BLOCK_REFERENCE_LIKE_FIXTURES)(
    'does not mistake definition-like text in a $name for a definition',
    ({ markdown }) => {
      expect(getMarkdownCompatibility(markdown)).toEqual({
        isRichTextSafe: true,
        reasons: [],
      });
    },
  );

  it.each(HTML_LITERAL_FIXTURES)(
    'does not mistake $name for active Markdown syntax',
    ({ markdown }) => {
      expect(getMarkdownCompatibility(markdown)).toEqual({
        isRichTextSafe: true,
        reasons: [],
      });
    },
  );
});
