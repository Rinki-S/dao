export const searchExtension = {
  id: 'search',
  name: 'Search',
  capabilities: {
    commands: [
      {
        id: 'open-search',
        title: 'Search All',
        description: 'Jump to local search',
        group: 'Navigate',
        keywords: ['open search', 'find'],
        targetId: 'search',
        focusSelector: '[data-command-target="search-query"]',
      },
    ],
  },
};
