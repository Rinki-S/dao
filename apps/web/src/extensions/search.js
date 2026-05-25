export const searchExtension = {
  id: 'search',
  name: 'Search',
  capabilities: {
    commands: [
      {
        id: 'open-search',
        title: 'Search All',
        description: 'Focus local search',
        group: 'Navigate',
        keywords: ['open search', 'find'],
        action: 'focus-search',
      },
    ],
  },
};
