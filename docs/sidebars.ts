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
    'reference-architectures',
  ],
};

export default sidebars;
