/**
 * Property-based test: Publication_Audit evidence chain completeness (Property 6)
 *
 * **Validates: Requirements 4.4**
 *
 * For any final Publication_Audit record, the evidence chain SHALL include
 * references to Route_Baseline, Canonical_Matrix, Retained_Code_Audit
 * (when applicable), link-validator result, content validation, and build result.
 * A record with any missing evidence reference SHALL NOT receive a `publish` decision.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  isEvidenceComplete,
  determinePublishDecision,
  generatePublicationAudit,
  type PageEvidence,
  type CommandEvidenceForPage,
  type RouteEvidenceForPage,
  type AuditEvidenceForPage,
} from './publication-audit.js';

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a non-empty reference string (simulates a valid evidence ref). */
const arbNonEmptyRef = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
  { minLength: 5, maxLength: 30 },
);

/** Generate a page path from the 16 In_Scope_Pages. */
const arbPage = fc.constantFrom(
  'get-started/overview',
  'get-started/preflight',
  'get-started/quickstart',
  'get-started/firstagent',
  'get-started/existing-agent',
  'get-started/deployment-methods',
  'tutorials/overview',
  'tutorials/add-memory',
  'tutorials/connect-gateway-tool',
  'workloads/overview',
  'workloads/conversational/overview',
  'workloads/conversational/quickstart',
  'workloads/coding/overview',
  'workloads/coding/quickstart',
  'workloads/workflow/overview',
  'workloads/workflow/quickstart',
);

/** Generate a valid owner string. */
const arbOwner = fc.constantFrom('team-docs', 'team-platform', 'team-tutorials', 'team-core');

/** Generate a valid ISO-8601 verification date. */
const arbVerificationDate = fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') })
  .map((d) => d.toISOString());

/**
 * Generate a RouteEvidenceForPage with the routeBaselineRef randomly
 * set to either a valid ref or null (missing).
 */
const arbRouteEvidence = (forcePresent: boolean): fc.Arbitrary<RouteEvidenceForPage> =>
  forcePresent
    ? arbNonEmptyRef.map((ref) => ({ routeBaselineRef: ref, result: 'pass' as const }))
    : fc.oneof(
        arbNonEmptyRef.map((ref) => ({ routeBaselineRef: ref, result: 'pass' as const })),
        fc.constant({ routeBaselineRef: null, result: 'pass' as const }),
      );

/**
 * Generate an AuditEvidenceForPage with canonicalMatrixRef and
 * retainedCodeAuditRef randomly present or missing.
 */
const arbAuditEvidence = (forcePresent: boolean): fc.Arbitrary<AuditEvidenceForPage> =>
  forcePresent
    ? fc.record({
        canonicalMatrixRef: arbNonEmptyRef,
        retainedCodeAuditRef: fc.oneof(arbNonEmptyRef, fc.constant(null)),
        hasFencedBlocks: fc.boolean(),
        failures: fc.constant([]),
      }).map((rec) => ({
        ...rec,
        // When hasFencedBlocks is true and we're forcing present, ensure ref is set
        retainedCodeAuditRef: rec.hasFencedBlocks
          ? rec.retainedCodeAuditRef ?? 'rca-default'
          : rec.retainedCodeAuditRef,
      }))
    : fc.record({
        canonicalMatrixRef: fc.oneof(arbNonEmptyRef, fc.constant(null)),
        retainedCodeAuditRef: fc.oneof(arbNonEmptyRef, fc.constant(null)),
        hasFencedBlocks: fc.boolean(),
        failures: fc.constant([]),
      });

/**
 * Generate CommandEvidenceForPage with each result randomly set to
 * a valid value or null (missing).
 */
const arbCommandEvidence = (forcePresent: boolean): fc.Arbitrary<CommandEvidenceForPage> =>
  forcePresent
    ? fc.constant({
        linkValidatorResult: 'pass' as const,
        contentValidationResult: 'pass' as const,
        buildResult: 'pass' as const,
        diffCheckResult: 'pass' as const,
      })
    : fc.record({
        linkValidatorResult: fc.oneof(
          fc.constant('pass' as const),
          fc.constant('fail-excepted' as const),
          fc.constant(null),
        ),
        contentValidationResult: fc.oneof(
          fc.constant('pass' as const),
          fc.constant('fail-excepted' as const),
          fc.constant(null),
        ),
        buildResult: fc.oneof(fc.constant('pass' as const), fc.constant(null)),
        diffCheckResult: fc.oneof(fc.constant('pass' as const), fc.constant(null)),
      });

/**
 * Generate a PageEvidence record with at least one evidence reference
 * randomly set to null (missing). This guarantees incomplete evidence.
 */
const arbIncompleteEvidence: fc.Arbitrary<PageEvidence> = fc
  .record({
    route: arbRouteEvidence(false),
    audit: arbAuditEvidence(false),
    commands: arbCommandEvidence(false),
    owner: arbOwner,
    verificationDate: arbVerificationDate,
  })
  .filter((evidence) => !isEvidenceComplete(evidence));

/**
 * Generate a PageEvidence record where ALL evidence references are present
 * (complete evidence). This guarantees the evidence is valid.
 */
const arbCompleteEvidence: fc.Arbitrary<PageEvidence> = fc.record({
  route: arbRouteEvidence(true),
  audit: arbAuditEvidence(true),
  commands: arbCommandEvidence(true),
  owner: arbOwner,
  verificationDate: arbVerificationDate,
});

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 6: Publication_Audit evidence chain completeness', () => {
  it('a record with ANY missing evidence reference SHALL NOT receive a publish decision', () => {
    fc.assert(
      fc.property(arbPage, arbIncompleteEvidence, (page, evidence) => {
        // The evidence is incomplete (at least one ref is missing)
        expect(isEvidenceComplete(evidence)).toBe(false);

        // Generate the Publication_Audit record
        const audit = generatePublicationAudit(page, evidence, [], []);

        // Property: Missing evidence → never publish
        expect(audit.publishDecision).toBe('hold');
      }),
      { numRuns: 200 },
    );
  });

  it('a record with complete evidence and no violations SHALL receive a publish decision', () => {
    fc.assert(
      fc.property(arbPage, arbCompleteEvidence, (page, evidence) => {
        // The evidence is complete
        expect(isEvidenceComplete(evidence)).toBe(true);

        // Generate the audit record with no violations and passing route
        const audit = generatePublicationAudit(page, evidence, [], []);

        // Property: Complete evidence + no violations + pass route → publish
        expect(audit.publishDecision).toBe('publish');
      }),
      { numRuns: 200 },
    );
  });

  it('isEvidenceComplete returns false when routeBaselineRef is null', () => {
    fc.assert(
      fc.property(arbAuditEvidence(true), arbCommandEvidence(true), arbOwner, arbVerificationDate, (audit, commands, owner, date) => {
        const evidence: PageEvidence = {
          route: { routeBaselineRef: null, result: 'pass' },
          audit,
          commands,
          owner,
          verificationDate: date,
        };
        expect(isEvidenceComplete(evidence)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('isEvidenceComplete returns false when canonicalMatrixRef is null', () => {
    fc.assert(
      fc.property(arbRouteEvidence(true), arbCommandEvidence(true), arbOwner, arbVerificationDate, fc.boolean(), (route, commands, owner, date, hasFenced) => {
        const evidence: PageEvidence = {
          route,
          audit: {
            canonicalMatrixRef: null,
            retainedCodeAuditRef: hasFenced ? 'rca-001' : null,
            hasFencedBlocks: hasFenced,
            failures: [],
          },
          commands,
          owner,
          verificationDate: date,
        };
        expect(isEvidenceComplete(evidence)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('isEvidenceComplete returns false when page has fenced blocks but retainedCodeAuditRef is null', () => {
    fc.assert(
      fc.property(arbRouteEvidence(true), arbCommandEvidence(true), arbOwner, arbVerificationDate, arbNonEmptyRef, (route, commands, owner, date, matrixRef) => {
        const evidence: PageEvidence = {
          route,
          audit: {
            canonicalMatrixRef: matrixRef,
            retainedCodeAuditRef: null,
            hasFencedBlocks: true,
            failures: [],
          },
          commands,
          owner,
          verificationDate: date,
        };
        expect(isEvidenceComplete(evidence)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('isEvidenceComplete returns false when any command result is null', () => {
    fc.assert(
      fc.property(
        arbRouteEvidence(true),
        arbAuditEvidence(true),
        arbOwner,
        arbVerificationDate,
        fc.constantFrom(
          'linkValidatorResult',
          'contentValidationResult',
          'buildResult',
          'diffCheckResult',
        ),
        (route, audit, owner, date, nullField) => {
          const commands: CommandEvidenceForPage = {
            linkValidatorResult: 'pass',
            contentValidationResult: 'pass',
            buildResult: 'pass',
            diffCheckResult: 'pass',
          };
          // Set one field to null
          (commands as Record<string, unknown>)[nullField] = null;

          const evidence: PageEvidence = {
            route,
            audit,
            commands,
            owner,
            verificationDate: date,
          };
          expect(isEvidenceComplete(evidence)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('determinePublishDecision always returns hold when evidence is incomplete regardless of other inputs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('passed' as const, 'needs-follow-up' as const, 'deferred' as const),
        fc.constantFrom('pass' as const, 'fail' as const),
        (status, routeResult) => {
          // Evidence incomplete → always hold
          const decision = determinePublishDecision(false, status, [], routeResult);
          expect(decision).toBe('hold');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('evidence chain completeness is independent of page path', () => {
    fc.assert(
      fc.property(arbPage, arbIncompleteEvidence, (page, evidence) => {
        // Verify different pages with same incomplete evidence all get hold
        const audit = generatePublicationAudit(page, evidence, [], []);
        expect(audit.publishDecision).toBe('hold');
        // The page field should still be correctly set
        expect(audit.page).toBe(page);
      }),
      { numRuns: 100 },
    );
  });
});
