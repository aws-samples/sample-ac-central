# AgentCore Central — Docusaurus Site

A documentation site for AgentCore Central built with [Docusaurus 3](https://docusaurus.io/) and hosted on GitLab Pages.

## Prerequisites

- **Node.js** >= 18.0
- **npm** >= 9.0

## Quick Start (Local Development)

```bash
# Navigate to the docs directory
cd docs

# Install dependencies
npm install

# Start development server (hot reload)
npm start
```

The site will be available at `http://localhost:3000/agentcore-central/`.

## Build for Production

```bash
npm run build
```

The static output is generated in the `build/` directory.

## Preview Production Build Locally

```bash
npm run build
npm run serve
```

## Project Structure

```
docs/
├── .gitlab-ci.yml          # GitLab Pages CI/CD pipeline
├── docusaurus.config.ts    # Docusaurus configuration
├── sidebars.ts             # Sidebar navigation structure
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript config
├── docs/                   # MDX content pages
│   ├── index.mdx           # Homepage with tile navigation
│   ├── reference-architectures.mdx
│   ├── archetypes/
│   │   ├── conversational.mdx
│   │   ├── event-driven.mdx
│   │   └── coding.mdx
│   └── patterns/
│       ├── overview.mdx
│       └── selection-guide.mdx
├── src/
│   └── css/
│       └── custom.css      # Custom theme styles
└── static/
    └── img/                # Images (copied from content/images/)
```

## GitLab Pages Deployment

The site is configured to deploy automatically via GitLab CI/CD.

### Setup

1. Push this repository to GitLab
2. The `.gitlab-ci.yml` at `docs/.gitlab-ci.yml` handles build and deployment
3. On push to the default branch, the site builds and deploys to GitLab Pages

### Configuration

Update these values in `docusaurus.config.ts` for your specific GitLab setup:

```typescript
url: 'https://your-gitlab-namespace.gitlab.io',
baseUrl: '/agentcore-central/',
```

Replace:
- `your-gitlab-namespace` → your GitLab group or username
- `agentcore-central` → your GitLab project name

### Alternative: Root-level CI Configuration

If you want the CI config at the repository root instead of inside `docs/`, create a root `.gitlab-ci.yml`:

```yaml
image: node:18-alpine

stages:
  - deploy

pages:
  stage: deploy
  script:
    - cd docs
    - npm ci
    - npm run build
    - mv build ../public
  artifacts:
    paths:
      - public
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

## Features

- **Dark/Light Theme** — Clean professional theme with automatic system preference detection
- **Full-Text Search** — Local search powered by `@easyops-cn/docusaurus-search-local` (no external services needed)
- **Tile Navigation** — Card-based navigation for major themes on homepage
- **MDX Support** — Rich content with React components embedded in Markdown
- **Responsive** — Mobile-friendly layout
- **Architecture Diagrams** — Visual flow diagrams for reference architectures

## Customization

### Theme Colors

Edit `src/css/custom.css` to change the primary color palette:

```css
:root {
  --ifm-color-primary: #6c8cff;
}
```

### Adding New Pages

1. Create a new `.mdx` file in the appropriate directory under `docs/`
2. Add frontmatter with `title`, `sidebar_label`, and `sidebar_position`
3. Add the page to `sidebars.ts` if needed

### Search

The site uses `@easyops-cn/docusaurus-search-local` for offline full-text search. No external Algolia account is needed. Search indexes are built at build time and served statically.

## Updating Content

Content is ported from the original HTML files in the `content/` directory. To update:

1. Edit the corresponding `.mdx` file in `docs/docs/`
2. Test locally with `npm start`
3. Push to trigger deployment


## License

This library is licensed under the MIT-0 License. See the [LICENSE](../LICENSE.txt) file.
