export const notesExtension = {
  id: 'notes',
  name: 'Notes',
  capabilities: {
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
