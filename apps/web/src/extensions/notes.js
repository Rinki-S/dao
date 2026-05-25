import { EditNote } from '@nine-thirty-five/material-symbols-react/rounded';

export const notesExtension = {
  id: 'notes',
  name: 'Notes',
  capabilities: {
    surfaces: [
      {
        id: 'notes',
        label: 'Notes',
        anchorId: 'notes',
        order: 50,
      },
    ],
    sidebarItems: [
      {
        id: 'notes',
        label: 'Notes',
        href: '#notes',
        icon: EditNote,
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
