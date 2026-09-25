# Contributing Guidelines

Thank you for your interest in contributing to this project. Whether it's a bug report, new feature, correction, or
additional documentation, we value feedback and contributions from our community.

Read through this document before submitting any issues or pull requests to ensure we have all the necessary
information to effectively respond to your bug report or contribution.


## Reporting Bugs and Feature Requests

Use the GitHub issue tracker to report bugs or suggest features.

When filing an issue, check existing open or recently closed issues to avoid duplicates. Include as much detail as you can:

- A reproducible test case or series of steps
- The version of the code being used
- Any modifications you made that are relevant to the bug
- Anything unusual about your environment or deployment


## Contributing via Pull Requests

Before sending a pull request, verify that:

1. You are working against the latest source on the `main` branch.
2. You checked existing open and recently merged pull requests to confirm the problem has not already been addressed.
3. You opened an issue to discuss significant work, so time is not wasted.

To send a pull request:

1. Fork the repository.
2. Modify the source, focusing on the specific change you are contributing. Reformatting unrelated code makes your change harder to review.
3. Ensure local validation and build pass (see [Local validation](#local-validation)).
4. Commit to your fork using clear commit messages.
5. Send the pull request and answer any default questions in the pull request interface.
6. Stay involved in the conversation and address any CI failures.

GitHub provides additional documentation on [forking a repository](https://help.github.com/articles/fork-a-repo/) and
[creating a pull request](https://help.github.com/articles/creating-a-pull-request/).


## Finding Contributions to Work On

Existing issues are a good starting point. Look at issues labeled `help wanted` to find well-scoped work.


## Content Contribution Standards

This is a public-facing documentation site. All content must meet the standards below before it is merged.

### Public-content approval

All content must be publishable publicly without restriction.

- Do not include internal URLs, internal code names, internal-only product references, or any information not yet
  publicly disclosed.
- Content is reviewed for public suitability during pull request review. If you are unsure whether something is
  shareable, omit it and note the uncertainty in the PR description.

### Source and citation expectations

Technical claims about AgentCore behavior must link to the official developer guide
(<https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/>) or the relevant public repository.

Architecture guidance that is not backed by official documentation must be labeled explicitly:

```
> **Guidance:** This pattern reflects community experience and is not an official AWS recommendation.
```

Do not present unverified patterns as official behavior.

### Version pinning

All copy-paste code examples must pin exact versions. Use the full version string, not a range or `@latest`.

Examples of correct pinning:

```
strands-agents==1.46.0
@aws/agentcore@0.23.0
```

State the pinned versions in the page's frontmatter info admonition so readers know when to check for updates.
Never use `@latest`, `*`, or unpinned ranges in tutorial or quickstart instructions.

### Marking pattern status

Label every capability or pattern with one of the following status markers from the site's established legend:

| Label | Meaning |
|---|---|
| **AgentCore-native** | Built into AgentCore; supported through the service API |
| **Preview** | Available but subject to change before general availability |
| **Adjacent AWS service** | An AWS service that integrates with AgentCore but is managed separately |
| **Customer-built pattern** | A pattern contributed from a customer implementation; not an AWS-managed feature |

Include the label near the top of the page or section, before any implementation detail.

### Customer stories

Every customer story must meet all of the following requirements before it is visible on the site:

- An externally shareable, publicly available source (AWS blog post, AWS case study page, or official press release).
- A "Source and verification" section that includes the source URL and a `last_verified` date.
- Evidence for every quantitative claim (e.g., "reduced latency by 40%"). Link directly to the source passage.
- No unresolved `TODO` comments in the file.

Stories that do not yet have a public source must set `draft: true` in their frontmatter so they are excluded from
the build and not published until a source is confirmed.

### Content-review checklist

Before opening a pull request, verify each item:

- [ ] No secrets, API keys, or secret-shaped strings (tokens, passwords, account IDs) in any file
- [ ] No internal URLs or internal product names
- [ ] All technical claims are sourced (linked to official docs) or labeled as guidance
- [ ] All code examples pin exact versions; no `@latest` or open ranges
- [ ] Images and diagrams have meaningful alt text (not "image" or the filename)
- [ ] Diagrams include a text description of the flow they illustrate
- [ ] Tutorials include a cleanup section and a cost estimate or cost-awareness note
- [ ] All links resolve without errors (`npm run build` passes with `onBrokenLinks: throw`)
- [ ] Frontmatter includes `title` and `last_verified` fields
- [ ] No unresolved `TODO` comments intended for a future author

### Local validation

Run the following commands before opening a pull request:

```bash
cd docs
npm run validate && npm run build
```

`npm run validate` checks for internal URLs, secret-like strings, unresolved TODOs, and front matter completeness
(see `docs/scripts/`). The build runs with `onBrokenLinks: throw`, so any broken link or missing reference causes a
build failure. Fix all failures before submitting.


## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.


## Security Issue Notifications

If you discover a potential security issue in this project, notify AWS/Amazon Security via our
[vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/). Do **not** create a public
GitHub issue for security vulnerabilities.


## Licensing

See the [LICENSE](LICENSE) file for this project's licensing. We will ask you to confirm the licensing of your
contribution.
