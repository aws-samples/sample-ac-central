import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  mainSidebar: [
    // 'index',
    {
      type: 'category',
      label: 'Agent Workloads',
      collapsed: false,
      items: [
        'workloads/overview',
        'workloads/conversational',
        'workloads/automation',
        'workloads/coding',
      ],
    },
    {
      type: 'category',
      label: 'AgentCore Platform',
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
