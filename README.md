# AgentCore Central

Internal documentation site for positioning, designing, and shipping agents on Amazon Bedrock AgentCore. Reference architectures, multi-agent patterns, agent archetype playbooks, and customer stories in one place.

**Live site:** https://agentcore-gtm.pages.aws.dev/agentcore-central

## What's Inside

| Section                | Purpose                                                       |
|------------------------|---------------------------------------------------------------|
| Get Started            | Quickstart, CLI guide, managed harness, pre-built skills      |
| Tutorials              | Step-by-step guides (add memory, connect gateway tools)       |
| Agent Workloads        | Conversational, Workflow, and Coding agent archetypes          |
| Agent Platform         | Platform stack, governance, observability, multi-tenancy       |
| Architectural Patterns | 12 multi-agent patterns with selection guide                  |
| Customers              | Reference architectures (external-approved and internal-only) |
| Field Guide            | Internal SA enablement material                               |

## Local Development

Prerequisites: Node.js 18+

```bash
cd docs
npm ci
npm start
```

The site opens at `http://localhost:3000/agentcore-central/`.

## Build

```bash
cd docs
npm ci
npm run build
```

Output goes to `docs/build/`.

## Deployment

Deployment is automatic via GitLab Pages. Pushing to the default branch triggers the CI pipeline (`.gitlab-ci.yml`), which builds and deploys to the Pages URL.

The pipeline uses `node:24-alpine` and runs `npm ci && npm run build` in the `docs/` directory.

## Project Structure

```text
agentcore-central/
├── docs/                    # Docusaurus project
│   ├── docs/                # Content (MDX files)
│   │   ├── get-started/     # Onboarding and quickstart
│   │   ├── tutorials/       # Step-by-step guides
│   │   ├── workloads/       # Agent archetypes (conversational, workflow, coding)
│   │   ├── agent-platform/  # Platform architecture and governance
│   │   ├── patterns/        # Multi-agent architectural patterns
│   │   ├── customer/        # Reference architectures and case studies
│   │   ├── field-guide/     # Internal enablement (SA-facing)
│   │   ├── reference/       # CLI reference, troubleshooting
│   │   └── index.mdx        # Landing page
│   ├── src/                 # React components, theme overrides, CSS
│   ├── static/              # Images, fonts, favicon
│   ├── sidebars.ts          # Navigation structure
│   ├── docusaurus.config.ts # Site configuration
│   └── package.json
├── .kiro/                   # AI workspace config (hooks, steering, MCP servers)
└── .gitlab-ci.yml           # CI/CD pipeline
```

## Contributing

1. Create a branch from `main`
2. Edit or add `.mdx` files under `docs/docs/`
3. Run locally to verify (`npm start`)
4. Submit a merge request

Content conventions:

- Use MDX (Markdown + JSX) for all documentation pages
- Follow the table alignment rules (pipe delimiters must form vertical columns)
- Avoid LLM writing markers (em dashes as joiners, filler words like "leverage", "comprehensive", hollow superlatives)
- Customer references: mark clearly as "External" or "Internal Only"
- Pin SDK/CLI versions in code examples and note them in the frontmatter info admonition

## Team

Maintained by the AgentCore GTM team. Repository: `gitlab.aws.dev/ravizraj/agentcore-central`
