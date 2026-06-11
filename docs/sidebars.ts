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
        'workloads/automation',
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
      label: 'Reference Architectures',
      collapsed: false,
      items: [
        'reference-architectures/overview',
        {
          type: 'category',
          label: 'Approved for External Use',
          collapsed: true,
          items: [
            'reference-architectures/external/rede-mater-dei',
            'reference-architectures/external/iberdrola',
            'reference-architectures/external/bgl',
            'reference-architectures/external/amazon-catalog',
            'reference-architectures/external/thomson-reuters',
            'reference-architectures/external/autoscout24',
            'reference-architectures/external/cox-automotive',
            'reference-architectures/external/blue-origin',
            'reference-architectures/external/kavak',
          ],
        },
        {
          type: 'category',
          label: 'Internal Only',
          collapsed: true,
          items: [
            'reference-architectures/internal/swisscom',
            'reference-architectures/internal/amazon-compliance',
            'reference-architectures/internal/druva',
            'reference-architectures/internal/parrot-analytics',
            'reference-architectures/internal/lobehub',
            'reference-architectures/internal/marubeni',
            'reference-architectures/internal/ebg',
            'reference-architectures/internal/wbd',
          ],
        },
      ],
    },
  ],
};

export default sidebars;
