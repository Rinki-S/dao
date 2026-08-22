import { Lexer, walkTokens } from 'marked';

const FRONTMATTER_PATTERN =
  /^(?:\uFEFF)?(?:---|\+\+\+)\s*\r?\n[\s\S]*?\r?\n(?:---|\+\+\+)\s*(?:\r?\n|$)/;
const FOOTNOTE_DEFINITION_PATTERN = /^ {0,3}\[\^[^\]\r\n]+\]:/m;

function getUnsupportedSyntax(markdown) {
  const syntax = {
    hasFootnoteDefinition: false,
    hasHtmlComment: false,
    hasRawHtml: false,
    hasReferenceDefinition: false,
    hasUnsafeQuotedTitle: false,
  };

  walkTokens(Lexer.lex(markdown), (token) => {
    if (token.type === 'def') {
      syntax.hasReferenceDefinition = true;
    }

    if (token.type === 'html') {
      if (token.raw.trimStart().startsWith('<!--')) {
        syntax.hasHtmlComment = true;
      } else {
        syntax.hasRawHtml = true;
      }
    }

    if (token.type === 'text' && FOOTNOTE_DEFINITION_PATTERN.test(token.raw)) {
      syntax.hasFootnoteDefinition = true;
    }

    if ((token.type === 'link' || token.type === 'image') && token.title?.includes('"')) {
      syntax.hasUnsafeQuotedTitle = true;
    }
  });

  return syntax;
}

/**
 * Detect Markdown constructs that the rich-text serializer cannot promise to
 * preserve. A conservative source-mode fallback is preferable to silently
 * rewriting a local-first note.
 *
 * @param {string} markdown
 * @returns {{ isRichTextSafe: boolean, reasons: string[] }}
 */
export function getMarkdownCompatibility(markdown) {
  const reasons = [];
  const unsupportedSyntax = getUnsupportedSyntax(markdown);

  if (FRONTMATTER_PATTERN.test(markdown)) {
    reasons.push('frontmatter');
  }

  if (unsupportedSyntax.hasHtmlComment) {
    reasons.push('HTML comments');
  }

  if (unsupportedSyntax.hasRawHtml) {
    reasons.push('raw HTML');
  }

  if (unsupportedSyntax.hasReferenceDefinition) {
    reasons.push('reference definitions');
  }

  if (unsupportedSyntax.hasFootnoteDefinition) {
    reasons.push('footnote definitions');
  }

  if (unsupportedSyntax.hasUnsafeQuotedTitle) {
    reasons.push('link or image titles with double quotes');
  }

  return {
    isRichTextSafe: reasons.length === 0,
    reasons,
  };
}
