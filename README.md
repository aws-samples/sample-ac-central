# AgentCore Central

Learn, build, and operate agents with Amazon Bedrock AgentCore. Reference architectures, multi-agent patterns, workload playbooks, and publicly sourced customer stories in one place.

## What's Inside

| Section                | Purpose                                                        |
|------------------------|----------------------------------------------------------------|
| Get Started            | Path chooser, preflight checks, quickstart                     |
| Tutorials              | Step-by-step guides (add memory, connect gateway tools)        |
| Agent Workloads        | Conversational, Workflow, and Coding reference patterns        |
| Agent Platform         | Platform stack, governance, observability, multi-tenancy       |
| Operate                | Production readiness, security, evaluations, cost, releases    |
| Architectural Patterns | 12 multi-agent patterns with selection guide                   |
| Customers              | Case studies based on publicly available, approved sources     |
| Reference              | agentcore.json, troubleshooting, glossary, public resources    |

## Local Development

Prerequisites: Node.js 20+

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
│   │   ├── customer/        # Publicly sourced case studies
│   │   ├── operate/         # Production readiness and operations
│   │   ├── reference/       # agentcore.json, troubleshooting, resources
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

1. Create a branch from `main`.
2. Edit or add `.mdx` files under `docs/docs/`.
3. Run `cd docs && npm run build` to confirm no broken links before opening a PR.
4. Submit a merge request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full public-content process: public-content approval, source and
citation expectations, version pinning, pattern status labels, the content-review checklist, and customer story
requirements.

## Team

Maintained by the AgentCore GTM team.


## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.
