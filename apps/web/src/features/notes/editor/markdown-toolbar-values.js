const MARKDOWN_DESTINATION_UNSAFE_CHARACTERS = /[\s<>"\\()]/g;
const MARKDOWN_LINK_PROTOCOL_PATTERN = /^([a-z][a-z\d+.-]*):/i;
const SUPPORTED_LINK_PROTOCOLS = new Set([
  'callto',
  'cid',
  'ftp',
  'ftps',
  'http',
  'https',
  'mailto',
  'sms',
  'tel',
  'xmpp',
]);

export function escapeMarkdownDestination(value) {
  return value.replace(MARKDOWN_DESTINATION_UNSAFE_CHARACTERS, (character) => {
    if (character === '(') {
      return '%28';
    }

    if (character === ')') {
      return '%29';
    }

    return encodeURIComponent(character);
  });
}

export function getMarkdownTitleError(title) {
  return title.includes('"') ? 'Titles cannot contain double quotes.' : '';
}

export function getMarkdownLinkDestinationError(value) {
  const protocol = value.trim().match(MARKDOWN_LINK_PROTOCOL_PATTERN)?.[1]?.toLowerCase();

  return protocol && !SUPPORTED_LINK_PROTOCOLS.has(protocol)
    ? 'This link protocol is not supported.'
    : '';
}
