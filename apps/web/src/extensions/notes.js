import { createElement } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import FileCodeIcon from '@hugeicons/core-free-icons/FileCodeIcon';

function MarkdownIcon(props) {
  return createElement(HugeiconsIcon, {
    icon: FileCodeIcon,
    ...props,
  });
}

export const notesExtension = {
  id: 'notes',
  name: 'Notes',
  capabilities: {
    contentFormats: [
      {
        format: 'markdown',
        label: 'Markdown',
        icon: MarkdownIcon,
      },
    ],
  },
};
