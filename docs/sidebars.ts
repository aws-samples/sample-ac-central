import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  mainSidebar: [
    // 'index',
    {
      type: 'category',
      label: 'Get Started',
      collapsed: true,
      items: [
        'get-started/overview',
        'get-started/firstagent',
        'get-started/quickstart',

      ],
    },
    {
      type: 'category',
      label: 'Agent Workloads',
      collapsed: false,
      items: [
        'workloads/overview',
        {
          type: 'category',
          label: 'Conversational Agents',
          items: [
            'workloads/conversational/overview',
            'workloads/conversational/quickstart',
            'workloads/conversational/enterprise-features',
            'workloads/conversational/session-management',
            'workloads/conversational/patterns-and-architecture',
          ],
        },
        {
          type: 'category',
          label: 'Workflow Agents',
          collapsed: false,
          items: [
            'workloads/workflow/overview',
            'workloads/workflow/quickstart',
            'workloads/workflow/event-processing',
            'workloads/workflow/bounded-autonomy',
            'workloads/workflow/tools-and-gateway',
            'workloads/workflow/memory-and-state',
            'workloads/workflow/evaluations',
            'workloads/workflow/patterns-and-architecture',
          ],
        },
        {
          type: 'category',
          label: 'Coding Agents',
          collapsed: false,
          items: [
            'workloads/coding/overview',
            'workloads/coding/quickstart',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Agent Platform',
      collapsed: true,
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
      collapsed: true,
      items: [
        'patterns/overview',
        'patterns/selection-guide',
      ],
    },
    {
      type: 'category',
      label: 'Customers',
      collapsed: true,
      items: [
        'customer/overview',
        'customer/external/rede-mater-dei',
        'customer/external/iberdrola',
        'customer/external/bgl',
        'customer/external/amazon-catalog',
        'customer/external/thomson-reuters',
        'customer/external/autoscout24',
        'customer/external/cox-automotive',
        'customer/external/blue-origin',
        'customer/external/kavak'
      ],
    },
    {
      type: 'category',
      label: 'Tutorials',
      collapsed: true,
      items: [
        'tutorials/overview',
        'tutorials/add-memory',
        'tutorials/connect-gateway-tool',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsed: true,
      items: [
        'reference/agentcore-json',
        'reference/troubleshooting',
        'reference/resources',
      ],
    },
  ],
};

export default sidebars;
