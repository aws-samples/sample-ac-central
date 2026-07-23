# AgentCore Central — Docusaurus Site

A public documentation site for AgentCore Central built with [Docusaurus 3](https://docusaurus.io/) and deployed via
GitLab Pages.

## Prerequisites

- **Node.js** >= 18.0
- **npm** >= 9.0

## Local Development

```bash
cd docs
npm ci
npm start
```

The site opens at `http://localhost:3000/` with hot reload enabled (the base URL is env-driven via `SITE_BASE_URL`; it defaults to `/` locally).

## Build

```bash
cd docs
npm ci
npm run build
```

Static output goes to `docs/build/`. The build runs with `onBrokenLinks: throw`, so any broken link causes a build
failure. Run this before opening a pull request.

## Preview a Production Build Locally

```bash
cd docs
npm run build
npm run serve
```

## Available Scripts

| Script | Purpose |
|---|---|
| `npm start` | Start dev server with hot reload |
| `npm run build` | Build static site for production |
| `npm run serve` | Preview the production build locally |
| `npm run clear` | Clear the Docusaurus cache |

## Project Structure

```
docs/
├── docs/                   # MDX content pages
│   ├── index.mdx           # Landing page
│   ├── get-started/        # Onboarding and quickstart
│   ├── tutorials/          # Step-by-step guides
│   ├── workloads/          # Agent archetypes (conversational, workflow, coding)
│   ├── agent-platform/     # Platform architecture and governance
│   ├── patterns/           # Multi-agent architectural patterns
│   ├── customer/           # Publicly sourced case studies
│   ├── operate/            # Production readiness and operations
│   └── reference/          # agentcore.json, troubleshooting, resources
├── scripts/                # Utility scripts (validation, content checks)
├── src/                    # React components, theme overrides, CSS
├── static/                 # Images, fonts, favicon
├── sidebars.ts             # Navigation structure
├── docusaurus.config.ts    # Site configuration
└── package.json            # Dependencies and npm scripts
```

## Deployment

Deployment is automatic. Pushing to the default branch triggers the GitLab CI pipeline (`.gitlab-ci.yml`), which
runs `npm ci && npm run build` in the `docs/` directory and deploys to GitLab Pages.

The pipeline uses `node:24-alpine`.

## Adding Content

1. Create a `.mdx` file in the appropriate directory under `docs/docs/`.
2. Add frontmatter with at minimum `title`, `sidebar_label`, `sidebar_position`, and `last_verified`.
3. Test locally with `npm start`.
4. Run `npm run build` to confirm no broken links.
5. Open a pull request.

Read [CONTRIBUTING.md](../CONTRIBUTING.md) for content standards: public-content approval, source requirements,
version pinning, pattern status labels, and the content-review checklist.

## Customization

### Theme Colors

Edit `src/css/custom.css`:

```css
:root {
  --ifm-color-primary: #6c8cff;
}
```

### Search

The site uses `@easyops-cn/docusaurus-search-local` for offline full-text search. No external search account is
needed. Search indexes are built at build time and served statically.

## License

This library is licensed under the MIT-0 License. See the [LICENSE](../LICENSE) file.
