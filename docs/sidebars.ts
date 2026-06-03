import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  mainSidebar: [
    'index',
    {
      type: 'category',
      label: 'Agent Archetypes',
      collapsed: false,
      items: [
        'archetypes/conversational',
        'archetypes/event-driven',
        'archetypes/coding',
      ],
    },
    {
      type: 'category',
      label: 'Architectural Patterns',
      collapsed: false,
      items: [
        'patterns/overview',
        'patterns/selection-guide',
      ],
    },
    'reference-architectures',
  ],
};

export default sidebars;
