export const searchExtension = {
  id: 'search',
  name: 'Search',
  capabilities: {
    sidebarItems: [
      {
        id: 'search',
        label: 'Search',
        href: '#search',
        order: 60,
      },
    ],
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
