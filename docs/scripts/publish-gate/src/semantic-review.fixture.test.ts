/**
 * Fixture tests for the Semantic Review Engine (F11, F15–F20).
 *
 * These are deterministic tests with specific known inputs and expected outputs,
 * validating Requirements 2.3, 4.2, 4.3, and 4.4: exception record completeness,
 * Next steps/Prototype_Boundary link enforcement, credential detection,
 * sandbox claim verification, and Publication_Audit evidence chain completeness.
 *
 * Validates: Requirements 2.3, 4.2, 4.3, 4.4
 */

import { describe, it, expect } from 'vitest';
import {
  detectCredentials,
  detectMissingNextSteps,
  detectMissingPrototypeBoundary,
  detectUnsupportedSandboxClaims,
  scanPageContent,
} from './semantic-review.js';
import {
  isValidExceptionRef,
  isEvidenceComplete,
  generatePublicationAudit,
  type PageEvidence,
} from './publication-audit.js';
import type { ApprovedExceptionRef } from './types.js';

// ─── Helper Factories ────────────────────────────────────────────────────────

function makeCompleteEvidence(overrides?: Partial<PageEvidence>): PageEvidence {
  return {
    route: {
      routeBaselineRef: 'route-baseline-001',
      result: 'pass',
    },
    audit: {
      canonicalMatrixRef: 'matrix-001',
      retainedCodeAuditRef: null,
      hasFencedBlocks: false,
      failures: [],
    },
    commands: {
      linkValidatorResult: 'pass',
      contentValidationResult: 'pass',
      buildResult: 'pass',
      diffCheckResult: 'pass',
    },
    owner: 'team-docs',
    verificationDate: '2025-01-15T10:00:00Z',
    ...overrides,
  };
}

function makeCompleteException(overrides?: Partial<ApprovedExceptionRef>): ApprovedExceptionRef {
  return {
    exceptionId: 'exc-001',
    field: 'linkValidatorResult',
    owner: 'team-docs',
    reason: 'Known redirect during migration',
    approvalReference: 'TICKET-456',
    expiryDate: '2025-12-31',
    publishBlocking: true,
    ...overrides,
  };
}

// ─── F11: Exception record missing `owner` field → fail ──────────────────────

describe('F11: Exception record missing owner field → fail', () => {
  it('rejects an exception record when the owner field is missing', () => {
    const incompleteRecord: Partial<ApprovedExceptionRef> = {
      exceptionId: 'exc-011',
      field: 'emittedRoute',
      // owner is intentionally omitted
      reason: 'Route changed during consolidation',
      approvalReference: 'TICKET-789',
      expiryDate: '2025-06-30',
      publishBlocking: true,
    };

    expect(isValidExceptionRef(incompleteRecord)).toBe(false);
  });

  it('rejects an exception record when the owner field is empty string', () => {
    const incompleteRecord: Partial<ApprovedExceptionRef> = {
      exceptionId: 'exc-012',
      field: 'sidebarLabel',
      owner: '',
      reason: 'Label update pending review',
      approvalReference: 'TICKET-790',
      expiryDate: '2025-06-30',
      publishBlocking: true,
    };

    expect(isValidExceptionRef(incompleteRecord)).toBe(false);
  });

  it('rejects an exception record when the owner field is whitespace only', () => {
    const incompleteRecord: Partial<ApprovedExceptionRef> = {
      exceptionId: 'exc-013',
      field: 'sidebarCategory',
      owner: '   ',
      reason: 'Category restructure in progress',
      approvalReference: 'TICKET-791',
      expiryDate: '2025-07-15',
      publishBlocking: true,
    };

    expect(isValidExceptionRef(incompleteRecord)).toBe(false);
  });

  it('accepts a complete exception record with all required fields', () => {
    const completeRecord = makeCompleteException();
    expect(isValidExceptionRef(completeRecord)).toBe(true);
  });
});

// ─── F15: Page missing Next steps section → fail ─────────────────────────────

describe('F15: Page missing Next steps section → fail', () => {
  it('detects a page that entirely lacks a Next steps section', () => {
    const content = `---
title: Get Started Overview
sidebar_label: Overview
---

## Introduction

AgentCore provides a managed runtime for AI agents.

## Features

- Managed scaling
- Built-in observability
- Multi-model support

## Summary

AgentCore simplifies agent deployment.
`;

    const violations = detectMissingNextSteps('get-started/overview', content);

    expect(violations).toHaveLength(1);
    expect(violations[0].violationType).toBe('missing-next-steps');
    expect(violations[0].page).toBe('get-started/overview');
    expect(violations[0].detail).toContain('does not contain');
    expect(violations[0].detail).toContain('Next steps');
    expect(violations[0].remediation).toContain('Add a "## Next steps" section');
  });

  it('detects via scanPageContent orchestrator as well', () => {
    const content = `## Overview\n\nSome overview content without any next steps.`;

    const violations = scanPageContent('get-started/preflight', content, {
      isPrototypeBoundaryPage: false,
    });

    const nextStepsViolations = violations.filter(
      (v) => v.violationType === 'missing-next-steps',
    );
    expect(nextStepsViolations).toHaveLength(1);
  });
});

// ─── F16: Deployment page missing Prototype_Boundary link → fail ─────────────

describe('F16: Deployment page missing Prototype_Boundary link → fail', () => {
  it('detects a deployment page without the Prototype_Boundary link', () => {
    const content = `---
title: Deployment Methods
sidebar_label: Deployment
---

## Deploy Your Agent

Choose from the following deployment options:

1. AWS Lambda
2. Amazon ECS
3. Amazon EKS

## Configuration

Set the following environment variables before deploying.

## Next steps

- [Monitor your agent](./monitoring)
- [Scale configuration](./scaling)
`;

    const violations = detectMissingPrototypeBoundary(
      'get-started/deployment-methods',
      content,
      true, // explicitly marked as prototype boundary page
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].violationType).toBe('missing-prototype-boundary');
    expect(violations[0].page).toBe('get-started/deployment-methods');
    expect(violations[0].detail).toContain('operate/production-readiness');
    expect(violations[0].remediation).toContain('operate/production-readiness');
  });

  it('passes when the Prototype_Boundary link is present', () => {
    const content = `---
title: Deployment Methods
---

## Deploy Your Agent

:::caution
Before deploying to production, review the [Production Readiness Guide](../operate/production-readiness).
:::

## Next steps

- [Monitor your agent](./monitoring)
`;

    const violations = detectMissingPrototypeBoundary(
      'get-started/deployment-methods',
      content,
      true,
    );

    expect(violations).toHaveLength(0);
  });
});

// ─── F17: Page with embedded credential pattern → fail ───────────────────────

describe('F17: Page with embedded credential pattern → fail', () => {
  it('detects an AWS Access Key ID embedded in page content', () => {
    const content = `---
title: Quick Start
---

## Configure Your Agent

Set up authentication with the following credentials:

\`\`\`python
import boto3

client = boto3.client(
    'bedrock-runtime',
    aws_access_key_id='AKIAIOSFODNN7EXAMPLE',
    aws_secret_access_key='wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region_name='us-east-1'
)
\`\`\`

## Next steps

- [Deploy](./deployment-methods)
`;

    const violations = detectCredentials('get-started/quickstart', content);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].violationType).toBe('embedded-credential');
    expect(violations[0].page).toBe('get-started/quickstart');
    expect(violations[0].detail).toContain('AWS Access Key ID');
    expect(violations[0].remediation).toContain('Remove the embedded credential');
    expect(violations[0].remediation).toContain('environment variables');
  });

  it('credentials are never exceptionable — always blocking via scanPageContent', () => {
    const content = `## Setup\nUse key AKIAIOSFODNN7EXAMPLE to authenticate.\n\n## Next steps\n\n- [Next](./next)`;

    const violations = scanPageContent('tutorials/overview', content, {
      isPrototypeBoundaryPage: false,
    });

    const credViolations = violations.filter(
      (v) => v.violationType === 'embedded-credential',
    );
    expect(credViolations.length).toBeGreaterThan(0);
  });
});

// ─── F18: Page with sandbox claim, no Supported_Sandbox_Claim → fail ─────────

describe('F18: Page with sandbox claim, no Supported_Sandbox_Claim → fail', () => {
  it('detects a sandbox claim without a matching Supported_Sandbox_Claim record', () => {
    const content = `---
title: Coding Quickstart
---

## Run Code Safely

Your agent can execute code in a sandboxed environment, ensuring
that user-submitted code cannot affect the host system.

The code interpreter handles Python execution automatically.

## Next steps

- [Advanced configuration](./advanced)
`;

    const violations = detectUnsupportedSandboxClaims(
      'workloads/coding/quickstart',
      content,
      [], // No supported sandbox claims registered
    );

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].violationType).toBe('unsupported-sandbox-claim');
    expect(violations[0].page).toBe('workloads/coding/quickstart');
    expect(violations[0].detail).toContain('sandbox');
    expect(violations[0].remediation).toContain('Supported_Sandbox_Claim');
  });

  it('passes when sandbox claim is backed by a Supported_Sandbox_Claim record', () => {
    const content = `## Execution\n\nCode runs in a sandboxed environment.\n\n## Next steps\n\n- [Next](./next)`;

    const supportedClaims = [
      {
        claimId: 'sandboxed',
        description: 'Verified sandboxed execution environment',
        canonicalTarget: 'sandbox-runtime-v1',
      },
    ];

    const violations = detectUnsupportedSandboxClaims(
      'workloads/coding/quickstart',
      content,
      supportedClaims,
    );

    expect(violations).toHaveLength(0);
  });
});

// ─── F19: Complete Publication_Audit with full evidence chain → pass ──────────

describe('F19: Complete Publication_Audit with full evidence chain → pass', () => {
  it('generates a publish decision when all evidence is present and no violations exist', () => {
    const evidence = makeCompleteEvidence();
    const exceptions: ApprovedExceptionRef[] = [];
    const contentViolations: import('./publication-audit.js').ContentViolation[] = [];

    const audit = generatePublicationAudit(
      'get-started/overview',
      evidence,
      exceptions,
      contentViolations,
    );

    expect(audit.page).toBe('get-started/overview');
    expect(audit.status).toBe('passed');
    expect(audit.publishDecision).toBe('publish');
    expect(audit.owner).toBe('team-docs');
    expect(audit.verificationDate).toBe('2025-01-15T10:00:00Z');

    // Verify full evidence chain is populated
    expect(audit.evidence.routeBaselineRef).toBe('route-baseline-001');
    expect(audit.evidence.canonicalMatrixRef).toBe('matrix-001');
    expect(audit.evidence.retainedCodeAuditRef).toBeNull(); // no fenced blocks
    expect(audit.evidence.linkValidatorResult).toBe('pass');
    expect(audit.evidence.contentValidationResult).toBe('pass');
    expect(audit.evidence.buildResult).toBe('pass');
    expect(audit.evidence.diffCheckResult).toBe('pass');
    expect(audit.exceptions).toHaveLength(0);
  });

  it('also publishes when page has fenced blocks with retained code audit ref', () => {
    const evidence = makeCompleteEvidence({
      audit: {
        canonicalMatrixRef: 'matrix-002',
        retainedCodeAuditRef: 'rca-001',
        hasFencedBlocks: true,
        failures: [],
      },
    });

    const audit = generatePublicationAudit(
      'get-started/quickstart',
      evidence,
      [],
      [],
    );

    expect(audit.publishDecision).toBe('publish');
    expect(audit.evidence.retainedCodeAuditRef).toBe('rca-001');
  });
});

// ─── F20: Publication_Audit missing `routeBaselineRef` → fail ────────────────

describe('F20: Publication_Audit missing routeBaselineRef → fail', () => {
  it('holds publication when routeBaselineRef is missing from evidence chain', () => {
    const evidence = makeCompleteEvidence({
      route: {
        routeBaselineRef: null, // Missing reference
        result: 'pass',
      },
    });

    const audit = generatePublicationAudit(
      'get-started/overview',
      evidence,
      [],
      [],
    );

    // The record must NOT receive a publish decision
    expect(audit.publishDecision).toBe('hold');
    // Evidence chain shows the empty ref
    expect(audit.evidence.routeBaselineRef).toBe('');
  });

  it('confirms evidence is marked incomplete when routeBaselineRef is null', () => {
    const evidence = makeCompleteEvidence({
      route: {
        routeBaselineRef: null,
        result: 'pass',
      },
    });

    expect(isEvidenceComplete(evidence)).toBe(false);
  });

  it('holds even when all other evidence references are present', () => {
    const evidence: PageEvidence = {
      route: {
        routeBaselineRef: null, // Only this is missing
        result: 'pass',
      },
      audit: {
        canonicalMatrixRef: 'matrix-001',
        retainedCodeAuditRef: 'rca-001',
        hasFencedBlocks: true,
        failures: [],
      },
      commands: {
        linkValidatorResult: 'pass',
        contentValidationResult: 'pass',
        buildResult: 'pass',
        diffCheckResult: 'pass',
      },
      owner: 'team-docs',
      verificationDate: '2025-01-15T10:00:00Z',
    };

    const audit = generatePublicationAudit(
      'tutorials/add-memory',
      evidence,
      [],
      [],
    );

    expect(audit.publishDecision).toBe('hold');
  });
});
