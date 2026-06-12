import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  mainSidebar: [
    // 'index',
    {
      type: 'category',
      label: 'Get Started',
      collapsed: false,
      items: [
        'get-started/overview',
        'get-started/managed-harness',
        'get-started/agentcore-cli',
        'get-started/pre-built-skills',
      ],
    },
    {
      type: 'category',
      label: 'Agent Workloads',
      collapsed: false,
      items: [
        'workloads/overview',
        'workloads/conversational',
        'workloads/workflow',
        'workloads/coding',
      ],
    },
    {
      type: 'category',
      label: 'Agent Platform',
      collapsed: false,
      items: [
        'agent-platform/overview',
        'agent-platform/platform-stack',
        'agent-platform/powered-by-agentcore',
        'agent-platform/governance',
        'agent-platform/observability-evals',
        'agent-platform/agent-ops',
        'agent-platform/multi-tenancy',
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
    {
      type: 'category',
      label: 'Customers',
      collapsed: false,
      items: [
        'customer/overview',
        {
          type: 'category',
          label: 'Approved for External Use',
          collapsed: true,
          items: [
            'customer/external/rede-mater-dei',
            'customer/external/iberdrola',
            'customer/external/bgl',
            'customer/external/amazon-catalog',
            'customer/external/thomson-reuters',
            'customer/external/autoscout24',
            'customer/external/cox-automotive',
            'customer/external/blue-origin',
            'customer/external/kavak',
          ],
        },
        {
          type: 'category',
          label: 'Internal Only',
          collapsed: true,
          items: [
            'customer/internal/swisscom',
            'customer/internal/amazon-compliance',
            'customer/internal/druva',
            'customer/internal/parrot-analytics',
            'customer/internal/lobehub',
            'customer/internal/marubeni',
            'customer/internal/ebg',
            'customer/internal/wbd',
          ],
        },
      ],
    },
  ],
};

export default sidebars;
