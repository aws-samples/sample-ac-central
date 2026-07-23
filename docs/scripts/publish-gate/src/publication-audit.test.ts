/**
 * Unit tests for Publication_Audit record generation.
 *
 * Tests cover:
 * - Evidence completeness checking
 * - Status determination based on violations/exceptions
 * - Publish decision logic (especially the "missing evidence → hold" rule)
 * - Batch generation
 * - Exception attachment
 */

import { describe, it, expect } from 'vitest';
import type {
  PageEvidence,
  ContentViolation,
  AllPagesEvidence,
} from './publication-audit.js';
import {
  isEvidenceComplete,
  determineStatus,
  determinePublishDecision,
  generatePublicationAudit,
  generateAllAudits,
  assemblePageEvidence,
} from './publication-audit.js';
import type { ApprovedExceptionRef, RouteComparisonResult } from './types.js';
import type { AuditReconciliationFailure } from './audit-reconciliation.js';
import type { CommandRunnerResult } from './command-runner.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

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

function makeException(overrides?: Partial<ApprovedExceptionRef>): ApprovedExceptionRef {
  return {
    exceptionId: 'exc-001',
    field: 'linkValidatorResult',
    owner: 'team-docs',
    reason: 'Known redirect in progress',
    approvalReference: 'TICKET-123',
    expiryDate: '2025-12-31',
    publishBlocking: true,
    ...overrides,
  };
}

// ─── isEvidenceComplete ──────────────────────────────────────────────────────

describe('isEvidenceComplete', () => {
  it('returns true when all evidence references are present', () => {
    const evidence = makeCompleteEvidence();
    expect(isEvidenceComplete(evidence)).toBe(true);
  });

  it('returns false when routeBaselineRef is missing', () => {
    const evidence = makeCompleteEvidence({
      route: { routeBaselineRef: null, result: 'pass' },
    });
    expect(isEvidenceComplete(evidence)).toBe(false);
  });

  it('returns false when canonicalMatrixRef is missing', () => {
    const evidence = makeCompleteEvidence({
      audit: {
        canonicalMatrixRef: null,
        retainedCodeAuditRef: null,
        hasFencedBlocks: false,
        failures: [],
      },
    });
    expect(isEvidenceComplete(evidence)).toBe(false);
  });

  it('returns false when page has fenced blocks but retainedCodeAuditRef is null', () => {
    const evidence = makeCompleteEvidence({
      audit: {
        canonicalMatrixRef: 'matrix-001',
        retainedCodeAuditRef: null,
        hasFencedBlocks: true,
        failures: [],
      },
    });
    expect(isEvidenceComplete(evidence)).toBe(false);
  });

  it('returns true when page has fenced blocks and retainedCodeAuditRef is present', () => {
    const evidence = makeCompleteEvidence({
      audit: {
        canonicalMatrixRef: 'matrix-001',
        retainedCodeAuditRef: 'rca-001',
        hasFencedBlocks: true,
        failures: [],
      },
    });
    expect(isEvidenceComplete(evidence)).toBe(true);
  });

  it('returns true when page has no fenced blocks and retainedCodeAuditRef is null', () => {
    const evidence = makeCompleteEvidence({
      audit: {
        canonicalMatrixRef: 'matrix-001',
        retainedCodeAuditRef: null,
        hasFencedBlocks: false,
        failures: [],
      },
    });
    expect(isEvidenceComplete(evidence)).toBe(true);
  });

  it('returns false when linkValidatorResult is null', () => {
    const evidence = makeCompleteEvidence({
      commands: {
        linkValidatorResult: null,
        contentValidationResult: 'pass',
        buildResult: 'pass',
        diffCheckResult: 'pass',
      },
    });
    expect(isEvidenceComplete(evidence)).toBe(false);
  });

  it('returns false when contentValidationResult is null', () => {
    const evidence = makeCompleteEvidence({
      commands: {
        linkValidatorResult: 'pass',
        contentValidationResult: null,
        buildResult: 'pass',
        diffCheckResult: 'pass',
      },
    });
    expect(isEvidenceComplete(evidence)).toBe(false);
  });

  it('returns false when buildResult is null', () => {
    const evidence = makeCompleteEvidence({
      commands: {
        linkValidatorResult: 'pass',
        contentValidationResult: 'pass',
        buildResult: null,
        diffCheckResult: 'pass',
      },
    });
    expect(isEvidenceComplete(evidence)).toBe(false);
  });

  it('returns false when diffCheckResult is null', () => {
    const evidence = makeCompleteEvidence({
      commands: {
        linkValidatorResult: 'pass',
        contentValidationResult: 'pass',
        buildResult: 'pass',
        diffCheckResult: null,
      },
    });
    expect(isEvidenceComplete(evidence)).toBe(false);
  });
});

// ─── determineStatus ─────────────────────────────────────────────────────────

describe('determineStatus', () => {
  it('returns passed when no violations and no audit failures', () => {
    const result = determineStatus([], [], []);
    expect(result.status).toBe('passed');
    expect(result.reason).toContain('All checks passed');
  });

  it('returns needs-follow-up for non-exceptionable violations', () => {
    const violations: ContentViolation[] = [
      {
        type: 'embedded-credential',
        detail: 'Found AWS key pattern',
        exceptionable: false,
      },
    ];
    const result = determineStatus(violations, [], []);
    expect(result.status).toBe('needs-follow-up');
    expect(result.reason).toContain('embedded-credential');
  });

  it('returns deferred when violations are exceptionable and exceptions exist', () => {
    const violations: ContentViolation[] = [
      {
        type: 'stale-navigation-label',
        detail: 'Label mismatch',
        exceptionable: true,
      },
    ];
    const exceptions: ApprovedExceptionRef[] = [makeException()];
    const result = determineStatus(violations, exceptions, []);
    expect(result.status).toBe('deferred');
    expect(result.reason).toContain('stale-navigation-label');
  });

  it('returns needs-follow-up when violations exist without exceptions', () => {
    const violations: ContentViolation[] = [
      {
        type: 'broken-local-link',
        detail: 'Link target not found',
        exceptionable: true,
      },
    ];
    const result = determineStatus(violations, [], []);
    expect(result.status).toBe('needs-follow-up');
    expect(result.reason).toContain('broken-local-link');
  });

  it('returns needs-follow-up for audit reconciliation failures', () => {
    const failures: AuditReconciliationFailure[] = [
      {
        page: 'get-started/overview',
        checkType: 'matrix-incomplete',
        detail: 'Missing owner',
        remediation: 'Add owner',
      },
    ];
    const result = determineStatus([], [], failures);
    expect(result.status).toBe('needs-follow-up');
    expect(result.reason).toContain('matrix-incomplete');
  });
});

// ─── determinePublishDecision ────────────────────────────────────────────────

describe('determinePublishDecision', () => {
  it('returns publish when evidence is complete, status is passed, and no violations', () => {
    const result = determinePublishDecision(true, 'passed', [], 'pass');
    expect(result).toBe('publish');
  });

  it('returns hold when evidence is incomplete (key rule)', () => {
    const result = determinePublishDecision(false, 'passed', [], 'pass');
    expect(result).toBe('hold');
  });

  it('returns hold when route comparison failed', () => {
    const result = determinePublishDecision(true, 'passed', [], 'fail');
    expect(result).toBe('hold');
  });

  it('returns hold when non-exceptionable violations exist', () => {
    const violations: ContentViolation[] = [
      {
        type: 'embedded-credential',
        detail: 'Found key',
        exceptionable: false,
      },
    ];
    const result = determinePublishDecision(true, 'passed', violations, 'pass');
    expect(result).toBe('hold');
  });

  it('returns hold when status is needs-follow-up', () => {
    const result = determinePublishDecision(true, 'needs-follow-up', [], 'pass');
    expect(result).toBe('hold');
  });

  it('returns hold when status is deferred', () => {
    const result = determinePublishDecision(true, 'deferred', [], 'pass');
    expect(result).toBe('hold');
  });
});

// ─── generatePublicationAudit ────────────────────────────────────────────────

describe('generatePublicationAudit', () => {
  it('generates a complete record with publish decision for clean page', () => {
    const evidence = makeCompleteEvidence();
    const audit = generatePublicationAudit(
      'get-started/overview',
      evidence,
      [],
      [],
    );

    expect(audit.page).toBe('get-started/overview');
    expect(audit.status).toBe('passed');
    expect(audit.owner).toBe('team-docs');
    expect(audit.verificationDate).toBe('2025-01-15T10:00:00Z');
    expect(audit.publishDecision).toBe('publish');
    expect(audit.evidence.routeBaselineRef).toBe('route-baseline-001');
    expect(audit.evidence.canonicalMatrixRef).toBe('matrix-001');
    expect(audit.evidence.retainedCodeAuditRef).toBeNull();
    expect(audit.evidence.linkValidatorResult).toBe('pass');
    expect(audit.evidence.contentValidationResult).toBe('pass');
    expect(audit.evidence.buildResult).toBe('pass');
    expect(audit.evidence.diffCheckResult).toBe('pass');
    expect(audit.exceptions).toHaveLength(0);
  });

  it('sets hold when routeBaselineRef is missing', () => {
    const evidence = makeCompleteEvidence({
      route: { routeBaselineRef: null, result: 'pass' },
    });
    const audit = generatePublicationAudit(
      'get-started/overview',
      evidence,
      [],
      [],
    );
    expect(audit.publishDecision).toBe('hold');
  });

  it('sets hold when canonicalMatrixRef is missing', () => {
    const evidence = makeCompleteEvidence({
      audit: {
        canonicalMatrixRef: null,
        retainedCodeAuditRef: null,
        hasFencedBlocks: false,
        failures: [],
      },
    });
    const audit = generatePublicationAudit(
      'get-started/overview',
      evidence,
      [],
      [],
    );
    expect(audit.publishDecision).toBe('hold');
  });

  it('attaches exceptions to the record', () => {
    const evidence = makeCompleteEvidence();
    const exceptions = [makeException()];
    const violations: ContentViolation[] = [
      {
        type: 'stale-navigation-label',
        detail: 'Label is stale',
        exceptionable: true,
      },
    ];

    const audit = generatePublicationAudit(
      'get-started/overview',
      evidence,
      exceptions,
      violations,
    );

    expect(audit.exceptions).toHaveLength(1);
    expect(audit.exceptions[0].exceptionId).toBe('exc-001');
  });

  it('rejects record with embedded credential (non-exceptionable)', () => {
    const evidence = makeCompleteEvidence();
    const violations: ContentViolation[] = [
      {
        type: 'embedded-credential',
        detail: 'AWS key detected',
        exceptionable: false,
      },
    ];

    const audit = generatePublicationAudit(
      'get-started/overview',
      evidence,
      [],
      violations,
    );

    expect(audit.publishDecision).toBe('hold');
    expect(audit.status).toBe('needs-follow-up');
  });

  it('holds when route comparison fails', () => {
    const evidence = makeCompleteEvidence({
      route: { routeBaselineRef: 'route-001', result: 'fail' },
    });
    const audit = generatePublicationAudit(
      'get-started/overview',
      evidence,
      [],
      [],
    );
    expect(audit.publishDecision).toBe('hold');
  });
});

// ─── generateAllAudits ───────────────────────────────────────────────────────

describe('generateAllAudits', () => {
  it('generates one audit per page in the evidence map', () => {
    const pages = new Map<string, PageEvidence>();
    pages.set('get-started/overview', makeCompleteEvidence());
    pages.set('get-started/preflight', makeCompleteEvidence());

    const allEvidence: AllPagesEvidence = {
      pages,
      contentViolations: new Map(),
      exceptions: new Map(),
    };

    const audits = generateAllAudits(allEvidence);
    expect(audits).toHaveLength(2);
    expect(audits[0].page).toBe('get-started/overview');
    expect(audits[1].page).toBe('get-started/preflight');
  });

  it('attaches page-specific violations and exceptions', () => {
    const pages = new Map<string, PageEvidence>();
    pages.set('get-started/overview', makeCompleteEvidence());

    const violations = new Map<string, ContentViolation[]>();
    violations.set('get-started/overview', [
      {
        type: 'stale-navigation-label',
        detail: 'Label stale',
        exceptionable: true,
      },
    ]);

    const exceptions = new Map<string, ApprovedExceptionRef[]>();
    exceptions.set('get-started/overview', [makeException()]);

    const allEvidence: AllPagesEvidence = {
      pages,
      contentViolations: violations,
      exceptions,
    };

    const audits = generateAllAudits(allEvidence);
    expect(audits[0].exceptions).toHaveLength(1);
    expect(audits[0].status).toBe('deferred');
  });

  it('returns empty array when no pages provided', () => {
    const allEvidence: AllPagesEvidence = {
      pages: new Map(),
      contentViolations: new Map(),
      exceptions: new Map(),
    };

    const audits = generateAllAudits(allEvidence);
    expect(audits).toHaveLength(0);
  });

  it('mixes publish and hold decisions across pages', () => {
    const pages = new Map<string, PageEvidence>();
    pages.set('get-started/overview', makeCompleteEvidence());
    pages.set(
      'get-started/preflight',
      makeCompleteEvidence({
        route: { routeBaselineRef: null, result: 'pass' },
      }),
    );

    const allEvidence: AllPagesEvidence = {
      pages,
      contentViolations: new Map(),
      exceptions: new Map(),
    };

    const audits = generateAllAudits(allEvidence);
    expect(audits[0].publishDecision).toBe('publish');
    expect(audits[1].publishDecision).toBe('hold');
  });
});

// ─── assemblePageEvidence ────────────────────────────────────────────────────

describe('assemblePageEvidence', () => {
  it('assembles evidence from route results, audit failures, and command results', () => {
    const routeResults: RouteComparisonResult[] = [
      {
        page: 'get-started/overview',
        comparisons: [],
        overallResult: 'pass',
      },
    ];
    const auditFailures: AuditReconciliationFailure[] = [];
    const commandResult: CommandRunnerResult = {
      passed: true,
      failures: [],
    };

    const matrixRefMap = new Map([['get-started/overview', 'matrix-001']]);
    const routeBaselineRefMap = new Map([['get-started/overview', 'route-001']]);
    const retainedCodeRefMap = new Map<string, string | null>([
      ['get-started/overview', null],
    ]);
    const hasFencedBlocksMap = new Map([['get-started/overview', false]]);

    const evidence = assemblePageEvidence(
      'get-started/overview',
      routeResults,
      auditFailures,
      commandResult,
      matrixRefMap,
      routeBaselineRefMap,
      retainedCodeRefMap,
      hasFencedBlocksMap,
      'team-docs',
      '2025-01-15T10:00:00Z',
    );

    expect(evidence.route.routeBaselineRef).toBe('route-001');
    expect(evidence.route.result).toBe('pass');
    expect(evidence.audit.canonicalMatrixRef).toBe('matrix-001');
    expect(evidence.audit.hasFencedBlocks).toBe(false);
    expect(evidence.commands.linkValidatorResult).toBe('pass');
    expect(evidence.commands.buildResult).toBe('pass');
    expect(evidence.owner).toBe('team-docs');
  });

  it('marks build as null when build command failed', () => {
    const routeResults: RouteComparisonResult[] = [
      {
        page: 'get-started/overview',
        comparisons: [],
        overallResult: 'pass',
      },
    ];
    const commandResult: CommandRunnerResult = {
      passed: false,
      failures: [
        {
          command: 'npm run build',
          exitCode: 1,
          page: null,
          failedAssertion: 'build-failed:exit-1',
          remediationPath: 'Fix build errors',
          timestamp: '2025-01-15T10:00:00Z',
        },
      ],
    };

    const evidence = assemblePageEvidence(
      'get-started/overview',
      routeResults,
      [],
      commandResult,
      new Map([['get-started/overview', 'matrix-001']]),
      new Map([['get-started/overview', 'route-001']]),
      new Map([['get-started/overview', null]]),
      new Map([['get-started/overview', false]]),
      'team-docs',
      '2025-01-15T10:00:00Z',
    );

    expect(evidence.commands.buildResult).toBeNull();
  });

  it('defaults to fail when page not found in route results', () => {
    const routeResults: RouteComparisonResult[] = [];
    const commandResult: CommandRunnerResult = {
      passed: true,
      failures: [],
    };

    const evidence = assemblePageEvidence(
      'get-started/overview',
      routeResults,
      [],
      commandResult,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      'team-docs',
      '2025-01-15T10:00:00Z',
    );

    expect(evidence.route.result).toBe('fail');
    expect(evidence.route.routeBaselineRef).toBeNull();
  });
});
