/**
 * Walk the server-sent events of a response body.
 *
 * A plain fetch rather than EventSource, in both places this is used.
 * EventSource can only issue a GET with no headers, and every request here
 * carries the session token — so the browser's own implementation is the one
 * thing that cannot talk to this service.
 *
 * The decoder is kept in streaming mode across chunks because a chunk boundary
 * can fall inside a multi-byte character — which for a transcript in Chinese is
 * not an edge case but most of them. Decoding each chunk on its own would turn
 * the split character into a replacement mark for good. Event boundaries move
 * for the same reason, so a partial event stays buffered rather than being
 * parsed as a broken one.
 */
export async function* readEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // A blank line ends an event. Anything after the last one is a partial
      // event still arriving, so it stays in the buffer.
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        const event = parseEvent(block);
        if (event) yield event;
      }
    }
  } finally {
    // Releasing matters on the paths that leave early — a parse that throws, a
    // caller that stops reading — where the body would otherwise stay locked.
    reader.releaseLock();
  }
}

function parseEvent(block) {
  let name = '';
  let data = '';

  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) name = line.slice('event: '.length);
    else if (line.startsWith('data: ')) data = line.slice('data: '.length);
  }

  // A comment line — ": open", ": keep-alive" — is how a stream stays open
  // through a proxy without saying anything. It is structure, not an event.
  if (!name || !data) return null;

  return { name, data: JSON.parse(data) };
}
