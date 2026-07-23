/**
 * Unit tests for the Semantic Review Engine — content scanning and violation detection.
 *
 * Tests each detector function independently with known inputs.
 */

import { describe, it, expect } from 'vitest';
import {
  detectCredentials,
  detectMissingNextSteps,
  detectMissingPrototypeBoundary,
  detectUnsupportedSandboxClaims,
  detectStaleNavigationLabels,
  detectBrokenLocalLinks,
  detectUnrecordedProcedures,
  scanPageContent,
  type SupportedSandboxClaim,
} from './semantic-review.js';

// ─── detectCredentials ───────────────────────────────────────────────────────

describe('detectCredentials', () => {
  it('detects AWS Access Key IDs', () => {
    const content = 'Use this key: AKIAIOSFODNN7EXAMPLE to authenticate.';
    const violations = detectCredentials('get-started/overview', content);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].violationType).toBe('embedded-credential');
    expect(violations[0].detail).toContain('AWS Access Key ID');
  });

  it('detects OpenAI/sk- style API keys', () => {
    const content = 'const apiKey = "sk-abc123def456ghi789jkl012mno345pqr678";';
    const violations = detectCredentials('tutorials/overview', content);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].violationType).toBe('embedded-credential');
    expect(violations[0].detail).toContain('secret key');
  });

  it('detects hardcoded passwords', () => {
    const content = 'password = "MyS3cur3P@ssw0rd!"';
    const violations = detectCredentials('get-started/quickstart', content);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].violationType).toBe('embedded-credential');
  });

  it('detects private key blocks', () => {
    const content = `
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA...
-----END RSA PRIVATE KEY-----
`;
    const violations = detectCredentials('tutorials/add-memory', content);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].violationType).toBe('embedded-credential');
    expect(violations[0].detail).toContain('Private key');
  });

  it('detects GitHub tokens', () => {
    const content = 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
    const violations = detectCredentials('get-started/overview', content);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].violationType).toBe('embedded-credential');
    expect(violations[0].detail).toContain('GitHub token');
  });

  it('detects Bearer tokens', () => {
    const content = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
    const violations = detectCredentials('get-started/overview', content);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].violationType).toBe('embedded-credential');
  });

  it('returns no violations for clean content', () => {
    const content = `
## Getting Started

This page shows how to configure your agent. Use environment variables
for all credentials:

\`\`\`bash
export AWS_ACCESS_KEY_ID=\$YOUR_KEY
\`\`\`
`;
    const violations = detectCredentials('get-started/overview', content);
    expect(violations).toEqual([]);
  });

  it('provides remediation guidance', () => {
    const content = 'api_key = "sk-abcdefghijklmnopqrstuvwxyz123456"';
    const violations = detectCredentials('get-started/overview', content);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].remediation).toContain('Remove the embedded credential');
  });
});

// ─── detectMissingNextSteps ──────────────────────────────────────────────────

describe('detectMissingNextSteps', () => {
  it('detects missing Next steps section', () => {
    const content = `
## Introduction

Some content here.

## Summary

Final thoughts.
`;
    const violations = detectMissingNextSteps('get-started/overview', content);
    expect(violations.length).toBe(1);
    expect(violations[0].violationType).toBe('missing-next-steps');
    expect(violations[0].detail).toContain('does not contain');
  });

  it('passes when Next steps section has internal link', () => {
    const content = `
## Introduction

Some content here.

## Next steps

- [Deploy your agent](./deployment-methods)
- [Add memory](../tutorials/add-memory)
`;
    const violations = detectMissingNextSteps('get-started/overview', content);
    expect(violations).toEqual([]);
  });

  it('detects Next steps section without internal links', () => {
    const content = `
## Introduction

Some content here.

## Next steps

Check out https://docs.aws.amazon.com for more information.
`;
    const violations = detectMissingNextSteps('get-started/overview', content);
    expect(violations.length).toBe(1);
    expect(violations[0].detail).toContain('no valid Central');
  });

  it('accepts ### Next steps heading level', () => {
    const content = `
## Section

Content.

### Next steps

- [Next page](/get-started/quickstart)
`;
    const violations = detectMissingNextSteps('get-started/overview', content);
    expect(violations).toEqual([]);
  });

  it('is case-insensitive for the heading', () => {
    const content = `
## NEXT STEPS

- [Deploy](./deploy)
`;
    const violations = detectMissingNextSteps('get-started/overview', content);
    expect(violations).toEqual([]);
  });
});

// ─── detectMissingPrototypeBoundary ──────────────────────────────────────────

describe('detectMissingPrototypeBoundary', () => {
  it('detects missing Prototype_Boundary link on deployment page', () => {
    const content = `
## Deploy your agent

Follow these steps to deploy.

## Next steps

- [Monitor](./monitoring)
`;
    const violations = detectMissingPrototypeBoundary(
      'get-started/deployment-methods',
      content,
      true,
    );
    expect(violations.length).toBe(1);
    expect(violations[0].violationType).toBe('missing-prototype-boundary');
    expect(violations[0].detail).toContain('operate/production-readiness');
  });

  it('passes when Prototype_Boundary link is present', () => {
    const content = `
## Deploy your agent

Follow these steps to deploy.

:::warning
Before going to production, review [Production Readiness](../operate/production-readiness).
:::

## Next steps

- [Monitor](./monitoring)
`;
    const violations = detectMissingPrototypeBoundary(
      'get-started/deployment-methods',
      content,
      true,
    );
    expect(violations).toEqual([]);
  });

  it('does not check non-prototype-boundary pages', () => {
    const content = `
## Overview

This is an overview page with no deployment content.
`;
    const violations = detectMissingPrototypeBoundary(
      'get-started/overview',
      content,
      false,
    );
    expect(violations).toEqual([]);
  });

  it('auto-detects prototype boundary pages by path (quickstart)', () => {
    const content = `
## Quick Start

Build and run your first agent.
`;
    // Don't pass isPrototypeBoundaryPage — let path detection handle it
    const violations = detectMissingPrototypeBoundary(
      'workloads/conversational/quickstart',
      content,
    );
    expect(violations.length).toBe(1);
    expect(violations[0].violationType).toBe('missing-prototype-boundary');
  });
});

// ─── detectUnsupportedSandboxClaims ──────────────────────────────────────────

describe('detectUnsupportedSandboxClaims', () => {
  const supportedClaims: SupportedSandboxClaim[] = [
    {
      claimId: 'text-to-python-ide',
      description: 'Python sandbox environment',
      canonicalTarget: 'text-to-python-ide',
    },
    {
      claimId: 'code-interpreter',
      description: 'Code interpreter sandbox',
      canonicalTarget: 'code-interpreter-v2',
    },
  ];

  it('detects unsupported sandbox claims', () => {
    const content = 'This agent runs in a sandboxed environment for safety.';
    const violations = detectUnsupportedSandboxClaims(
      'tutorials/overview',
      content,
      [], // No supported claims
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].violationType).toBe('unsupported-sandbox-claim');
  });

  it('passes when sandbox claim is supported', () => {
    const content = 'This uses the code interpreter for execution.';
    const violations = detectUnsupportedSandboxClaims(
      'tutorials/overview',
      content,
      supportedClaims,
    );
    expect(violations).toEqual([]);
  });

  it('detects multiple unsupported claims', () => {
    const content = 'Use the sandbox and isolated execution environment.';
    const violations = detectUnsupportedSandboxClaims(
      'tutorials/overview',
      content,
      [], // No supported claims
    );
    expect(violations.length).toBeGreaterThan(0);
  });
});

// ─── detectStaleNavigationLabels ─────────────────────────────────────────────

describe('detectStaleNavigationLabels', () => {
  const validLabels = ['Get Started', 'Tutorials', 'Workloads'];

  it('detects stale sidebar_label in frontmatter', () => {
    const content = `---
title: Overview
sidebar_label: Old Label
---

# Overview
`;
    const violations = detectStaleNavigationLabels(
      'get-started/overview',
      content,
      validLabels,
    );
    expect(violations.length).toBe(1);
    expect(violations[0].violationType).toBe('stale-navigation-label');
    expect(violations[0].detail).toContain('Old Label');
  });

  it('passes when sidebar_label is valid', () => {
    const content = `---
title: Overview
sidebar_label: Get Started
---

# Overview
`;
    const violations = detectStaleNavigationLabels(
      'get-started/overview',
      content,
      validLabels,
    );
    expect(violations).toEqual([]);
  });

  it('returns no violations when no frontmatter present', () => {
    const content = '# Overview\n\nSome content.';
    const violations = detectStaleNavigationLabels(
      'get-started/overview',
      content,
      validLabels,
    );
    expect(violations).toEqual([]);
  });

  it('returns no violations when validLabels is empty', () => {
    const content = `---
sidebar_label: Anything
---
`;
    const violations = detectStaleNavigationLabels(
      'get-started/overview',
      content,
      [],
    );
    expect(violations).toEqual([]);
  });
});

// ─── detectBrokenLocalLinks ──────────────────────────────────────────────────

describe('detectBrokenLocalLinks', () => {
  const validLinks = [
    'get-started/overview',
    'get-started/quickstart',
    'tutorials/add-memory',
    'operate/production-readiness',
  ];

  it('detects broken local links', () => {
    const content = '[See details](./nonexistent-page)';
    const violations = detectBrokenLocalLinks(
      'get-started/overview',
      content,
      validLinks,
    );
    expect(violations.length).toBe(1);
    expect(violations[0].violationType).toBe('broken-local-link');
    expect(violations[0].detail).toContain('nonexistent-page');
  });

  it('passes for valid local links', () => {
    const content = '[Quick Start](get-started/quickstart)';
    const violations = detectBrokenLocalLinks(
      'get-started/overview',
      content,
      validLinks,
    );
    expect(violations).toEqual([]);
  });

  it('ignores external links', () => {
    const content = '[AWS Docs](https://docs.aws.amazon.com/bedrock)';
    const violations = detectBrokenLocalLinks(
      'get-started/overview',
      content,
      validLinks,
    );
    expect(violations).toEqual([]);
  });

  it('ignores anchor-only links', () => {
    const content = '[Section](#section-heading)';
    const violations = detectBrokenLocalLinks(
      'get-started/overview',
      content,
      validLinks,
    );
    expect(violations).toEqual([]);
  });

  it('strips query params and anchors before checking', () => {
    const content = '[Quick Start](get-started/quickstart#step-1?tab=python)';
    const violations = detectBrokenLocalLinks(
      'get-started/overview',
      content,
      validLinks,
    );
    expect(violations).toEqual([]);
  });
});

// ─── detectUnrecordedProcedures ──────────────────────────────────────────────

describe('detectUnrecordedProcedures', () => {
  it('detects unrecorded runnable bash blocks', () => {
    const content = `
## Setup

\`\`\`bash
$ npm install @aws-sdk/client-bedrock
\`\`\`
`;
    const violations = detectUnrecordedProcedures(
      'get-started/quickstart',
      content,
      [],
    );
    expect(violations.length).toBe(1);
    expect(violations[0].violationType).toBe('unrecorded-procedure');
  });

  it('passes when procedure is recorded', () => {
    const content = `
## Setup

\`\`\`bash
$ npm install @aws-sdk/client-bedrock
\`\`\`
`;
    const violations = detectUnrecordedProcedures(
      'get-started/quickstart',
      content,
      ['get-started/quickstart:block-0'],
    );
    expect(violations).toEqual([]);
  });

  it('ignores non-runnable code blocks', () => {
    const content = `
## Example

\`\`\`json
{ "key": "value" }
\`\`\`
`;
    const violations = detectUnrecordedProcedures(
      'get-started/quickstart',
      content,
      [],
    );
    expect(violations).toEqual([]);
  });

  it('detects multiple unrecorded procedures', () => {
    const content = `
\`\`\`bash
$ npm install something
\`\`\`

\`\`\`python
python main.py
\`\`\`
`;
    const violations = detectUnrecordedProcedures(
      'get-started/quickstart',
      content,
      [],
    );
    expect(violations.length).toBe(2);
  });
});

// ─── scanPageContent (orchestrator) ──────────────────────────────────────────

describe('scanPageContent', () => {
  it('combines multiple violation types', () => {
    const content = `
## Deploy

Use key AKIAIOSFODNN7EXAMPLE for auth.

\`\`\`bash
$ aws deploy
\`\`\`
`;
    const violations = scanPageContent('get-started/deployment-methods', content, {
      isPrototypeBoundaryPage: true,
      recordedProcedures: [],
    });

    const types = violations.map((v) => v.violationType);
    expect(types).toContain('embedded-credential');
    expect(types).toContain('missing-next-steps');
    expect(types).toContain('missing-prototype-boundary');
    expect(types).toContain('unrecorded-procedure');
  });

  it('returns empty array for fully compliant page', () => {
    const content = `---
title: Overview
---

## Introduction

Learn about agents.

## Next steps

- [Get started](./quickstart)
- [Production readiness](../operate/production-readiness)
`;
    const violations = scanPageContent('get-started/overview', content, {
      isPrototypeBoundaryPage: false,
    });
    expect(violations).toEqual([]);
  });

  it('always checks credentials even without options', () => {
    const content = 'secret = "sk-1234567890abcdefghijklmnopqrstuvwxyz"';
    const violations = scanPageContent('get-started/overview', content);
    expect(violations.some((v) => v.violationType === 'embedded-credential')).toBe(true);
  });

  it('skips optional checks when options not provided', () => {
    const content = 'sandbox environment available';
    const violations = scanPageContent('tutorials/overview', content);
    // Without supportedSandboxClaims in options, sandbox detection is skipped
    expect(violations.some((v) => v.violationType === 'unsupported-sandbox-claim')).toBe(false);
  });
});
