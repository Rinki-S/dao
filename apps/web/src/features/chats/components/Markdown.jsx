import { Fragment, useMemo } from 'react';
import { marked } from 'marked';

/**
 * Schemes a link in a model's reply is allowed to have.
 *
 * marked hands back whatever was written, `javascript:` included, so this is
 * not theoretical tidiness: it is the one place where text a model produced
 * would otherwise become something the browser executes. A link with any other
 * scheme is rendered as its own text, which is honest — the reader still sees
 * exactly what the model wrote.
 */
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

function safeHref(href) {
  try {
    // Relative URLs resolve against the page, which for an artifact of a chat
    // reply is never meaningful, so a base is supplied only to let the parser
    // work and the result is required to be one of the schemes above.
    const url = new URL(href, 'https://invalid.invalid');
    return SAFE_SCHEMES.includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

function Inline({ tokens }) {
  return (
    <>
      {tokens.map((token, index) => (
        <Fragment key={index}>{inlineNode(token)}</Fragment>
      ))}
    </>
  );
}

function inlineNode(token) {
  switch (token.type) {
    case 'text':
    case 'escape':
      return token.text;
    case 'strong':
      return (
        <strong className="font-semibold">
          <Inline tokens={token.tokens} />
        </strong>
      );
    case 'em':
      return (
        <em>
          <Inline tokens={token.tokens} />
        </em>
      );
    case 'del':
      return (
        <del>
          <Inline tokens={token.tokens} />
        </del>
      );
    case 'codespan':
      return (
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{token.text}</code>
      );
    case 'br':
      return <br />;
    case 'link': {
      const href = safeHref(token.href);
      if (!href) return token.raw;

      return (
        <a
          className="underline underline-offset-2"
          href={href}
          rel="noreferrer noopener"
          target="_blank"
        >
          <Inline tokens={token.tokens} />
        </a>
      );
    }
    case 'image': {
      // Not rendered as an image. Loading one would send a request to whatever
      // host the model named, from an app whose promise is that nothing leaves
      // the device unasked — and a one-pixel image is how that gets abused. The
      // alt text and the address are shown instead, and the reader decides.
      const href = safeHref(token.href);
      const alt = token.text || 'image';

      return href ? (
        <a
          className="underline underline-offset-2"
          href={href}
          rel="noreferrer noopener"
          target="_blank"
        >
          {alt}
        </a>
      ) : (
        alt
      );
    }
    default:
      // Raw HTML lands here and is shown as the text it is, never interpreted.
      // So does anything this build does not know about: showing the source is
      // always better than dropping it.
      return token.raw ?? token.text ?? '';
  }
}

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

function Block({ token }) {
  switch (token.type) {
    case 'space':
      return null;
    case 'paragraph':
      return (
        <p>
          <Inline tokens={token.tokens} />
        </p>
      );
    case 'heading': {
      // Levels are capped rather than trusted: a reply that opens with a
      // heading should not outrank the page's own, and h1 through h6 is the
      // whole range marked can produce.
      const Tag = HEADINGS[Math.min(token.depth, 6) - 1];

      return (
        <Tag className="font-heading font-semibold text-[1.05em]">
          <Inline tokens={token.tokens} />
        </Tag>
      );
    }
    case 'code':
      // The container scrolls rather than the page: a long line of code must
      // not make the whole transcript scroll sideways.
      return (
        <pre className="overflow-x-auto rounded-md bg-muted p-3">
          <code className="font-mono text-xs">{token.text}</code>
        </pre>
      );
    case 'blockquote':
      return (
        <blockquote className="border-s-2 ps-3 text-muted-foreground">
          <Blocks tokens={token.tokens} />
        </blockquote>
      );
    case 'list': {
      const Tag = token.ordered ? 'ol' : 'ul';

      return (
        <Tag
          className={token.ordered ? 'list-decimal ps-5' : 'list-disc ps-5'}
          start={token.ordered && token.start !== '' ? token.start : undefined}
        >
          {token.items.map((item, index) => (
            <li key={index}>
              <Blocks tokens={item.tokens} />
            </li>
          ))}
        </Tag>
      );
    }
    case 'table':
      return (
        <div className="overflow-x-auto">
          {/* Sized to its content rather than stretched to the pane: a
              two-column table pulled to full width puts its second column an
              inch from its first, which reads as two unrelated lists. The
              wrapper is what handles a table too wide to fit. */}
          <table className="border-collapse text-start">
            <thead>
              <tr>
                {token.header.map((cell, index) => (
                  <th className="border-b p-2 text-start font-semibold" key={index}>
                    <Inline tokens={cell.tokens} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {token.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td className="border-b p-2" key={index}>
                      <Inline tokens={cell.tokens} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr className="border-border" />;
    case 'text':
      // What a tight list item's content arrives as.
      return token.tokens ? <Inline tokens={token.tokens} /> : token.text;
    default:
      return <p className="whitespace-pre-wrap">{token.raw}</p>;
  }
}

function Blocks({ tokens }) {
  return (
    <>
      {tokens.map((token, index) => (
        <Block key={index} token={token} />
      ))}
    </>
  );
}

/**
 * A model's reply, rendered.
 *
 * Markdown becomes React elements, never an HTML string. That is the whole
 * safety argument: there is no dangerouslySetInnerHTML anywhere below, so there
 * is no sanitiser to configure correctly and no way for a tag in the model's
 * output to become a tag in the document. The two places where text could still
 * turn into behaviour — a link's scheme and an image's address — are handled
 * explicitly above.
 *
 * Re-lexed on every render, which during a stream means once per delta. The
 * text is a few kilobytes at most and lexing it is microseconds; the
 * alternative is keeping a parse tree in sync with a string that changes forty
 * times a second, which is a real bug in exchange for an imaginary saving.
 */
export function Markdown({ text }) {
  const tokens = useMemo(() => marked.lexer(text), [text]);

  return <Blocks tokens={tokens} />;
}
