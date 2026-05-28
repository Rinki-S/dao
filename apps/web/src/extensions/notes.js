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
    surfaces: [
      {
        id: 'notes',
        label: 'Notes',
        anchorId: 'notes',
        order: 50,
      },
    ],
    commands: [
      {
        id: 'create-note',
        title: 'Create Note',
        description: 'Focus the note form',
        group: 'Create',
        keywords: ['new note', 'add note', 'capture'],
        targetId: 'notes',
        focusSelector: '[data-command-target="note-title"]',
      },
      {
        id: 'open-notes',
        title: 'Open Notes',
        description: 'Jump to notes',
        group: 'Navigate',
        keywords: ['note'],
        targetId: 'notes',
      },
    ],
  },
};
