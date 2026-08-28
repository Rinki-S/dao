import MarkstreamRender from 'markstream-react';
// The self-contained stylesheet, not index.tailwind.css. That one omits the
// utility classes the components emit — list-disc, my-8 — on the assumption
// that the host's Tailwind supplies them. Tailwind v4 only generates the
// utilities it finds by scanning source, and it cannot see a class name that
// only exists inside a dependency's compiled JavaScript, so the lists came out
// with no bullets. This variant carries its own, scoped to .markstream-react.
import 'markstream-react/index.css';
// Dao's own look, applied over it. Imported after, so it wins ties.
import './markdown.css';

/**
 * Schemes a link in a model's reply is allowed to have.
 *
 * The parser hands back whatever was written, `javascript:` included, so this
 * is the one line standing between text a model produced and something the
 * browser runs. A link with any other scheme is rendered as its own text, which
 * is honest — the reader still sees exactly what the model wrote.
 */
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

function isSafeHref(href) {
  try {
    // Parsed with no base, so the address has to carry its own scheme. Giving
    // it one to resolve against would say yes to an empty string and to every
    // relative path — and a relative link in a chat reply resolves against the
    // app's own URL, which is not a place the model can have meant.
    return SAFE_SCHEMES.includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

/**
 * An image, turned into a link to itself.
 *
 * Never rendered as an image. Loading one would send a request to whatever host
 * the model named, from an app whose promise is that nothing leaves the device
 * unasked — and a one-pixel image is how that gets abused. The alt text and the
 * address are offered instead and the reader decides.
 */
function imageAsLink(image) {
  const alt = image.alt || 'image';

  if (!isSafeHref(image.src)) {
    return { type: 'text', raw: image.raw, content: alt };
  }

  return {
    type: 'link',
    raw: image.raw,
    href: image.src,
    title: image.title ?? null,
    text: alt,
    children: [{ type: 'text', raw: alt, content: alt }],
  };
}

/**
 * Rewrite every image in the tree, at any depth.
 *
 * Done on the parsed nodes rather than by disabling the parser's image rule,
 * because this way the reader still gets something to click. It walks every
 * array-valued field rather than a known list of them — a table keeps its cells
 * under a different name from a paragraph's children, and an image missed
 * because of a field name is an image that loads.
 */
function withoutImages(node) {
  if (Array.isArray(node)) return node.map(withoutImages);
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'image') return imageAsLink(node);

  let changed = false;
  const next = { ...node };

  for (const [key, value] of Object.entries(node)) {
    if (!Array.isArray(value)) continue;

    const mapped = value.map(withoutImages);
    if (mapped.some((item, index) => item !== value[index])) {
      next[key] = mapped;
      changed = true;
    }
  }

  // The node itself is returned when nothing under it changed, so the renderer
  // can keep treating it as the same object between streamed parses.
  return changed ? next : node;
}

const PARSE_OPTIONS = {
  // Links are only emitted when this passes; the rest render as their own text.
  validateLink: isSafeHref,
  postTransformNodes: (nodes) => nodes.map(withoutImages),
};

/**
 * A model's reply, rendered.
 *
 * markstream is built for exactly this input — a Markdown document that arrives
 * a token at a time and is invalid at almost every moment in between. Telling
 * it whether the stream has ended is the whole reason it is here: while `final`
 * is false an unclosed fence is a fence still being written, and when it turns
 * true the same trailing characters become literal text. A renderer that cannot
 * tell those apart has to guess, and guesses differently on every keystroke.
 *
 * Three things are pinned here rather than left at their defaults, and they are
 * the same three the hand-written renderer this replaces existed to get right:
 *
 * `htmlPolicy="escape"` renders raw HTML in a reply as the text it is. The
 * library's default is "safe", which sanitises and renders — right for content
 * an application controls, and this is content a model wrote.
 *
 * `validateLink` refuses any scheme a browser should not follow.
 *
 * `postTransformNodes` turns images into links so that nothing in a reply
 * causes a request to a host the model chose.
 */
export function Markdown({ text, final = true }) {
  // The wrapper is what markdown.css hangs off. markstream takes no className,
  // and the extra class is needed anyway: its markup carries utility classes
  // that outrank a bare element selector.
  return (
    <div className="dao-chat-markdown">
      <MarkstreamRender
        content={text}
        final={final}
        htmlPolicy="escape"
        parseOptions={PARSE_OPTIONS}
      />
    </div>
  );
}
