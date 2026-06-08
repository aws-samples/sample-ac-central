import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  mainSidebar: [
    'index',
    {
      type: 'category',
      label: 'Agent Types',
      collapsed: false,
      items: [
        'agenttypes/conversational',
        'agenttypes/automation',
        'agenttypes/coding',
      ],
    },
    {
      type: 'category',
      label: 'Architectural Platform',
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
