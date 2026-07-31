import { IconFileCode } from '@tabler/icons-react';

export const notesExtension = {
  id: 'notes',
  name: 'Notes',
  capabilities: {
    contentFormats: [
      {
        format: 'markdown',
        label: 'Markdown',
        icon: IconFileCode,
      },
    ],
  },
};
