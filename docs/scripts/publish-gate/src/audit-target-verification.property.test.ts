/**
 * Property-based test: Target verification completeness (Property 3)
 *
 * **Validates: Requirements 1.4**
 *
 * For any In_Scope_Page with a changed default target or alternatives,
 * if any target lacks a verified status, then the gate SHALL block
 * publication for that page.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { reconcileAudits, type MatrixRecord } from './audit-reconciliation.js';

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a page path. */
const arbPagePath = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-/'.split('')),
  { minLength: 3, maxLength: 30 },
);

/** Generate a non-empty alternative target name. */
const arbTargetName = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
  { minLength: 1, maxLength: 20 },
);

/**
 * Generate a page with 1–5 alternative targets in random verification states.
 * The default target also gets a random verification state.
 */
const arbPageWithTargets: fc.Arbitrary<{
  page: string;
  defaultVerified: boolean;
  alternatives: Array<{ name: string; verified: boolean }>;
}> = fc.record({
  page: arbPagePath,
  defaultVerified: fc.boolean(),
  alternatives: fc.array(
    fc.record({
      name: arbTargetName,
      verified: fc.boolean(),
    }),
    { minLength: 1, maxLength: 5 },
  ),
});

/**
 * Build a complete MatrixRecord from generated target data.
 * The record is made complete (has owner and timestamp) so that
 * only target verification checks are tested in isolation.
 */
function buildMatrixRecord(data: {
  page: string;
  defaultVerified: boolean;
  alternatives: Array<{ name: string; verified: boolean }>;
}): MatrixRecord {
  return {
    page: data.page,
    owner: 'team-docs',
    verificationTimestamp: '2024-01-15T10:00:00Z',
    targets: {
      defaultTarget: { verified: data.defaultVerified },
      alternatives: data.alternatives,
    },
  };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 3: Target verification completeness', () => {
  it('any unverified target blocks publication for that page', () => {
    fc.assert(
      fc.property(arbPageWithTargets, (pageData) => {
        const matrixRecord = buildMatrixRecord(pageData);
        const pages = [pageData.page] as const;

        const failures = reconcileAudits([matrixRecord], [], [], pages);

        // Count how many targets are unverified
        const unverifiedCount =
          (pageData.defaultVerified ? 0 : 1) +
          pageData.alternatives.filter((alt) => !alt.verified).length;

        // Filter to only target-unverified failures for this page
        const targetFailures = failures.filter(
          (f) => f.page === pageData.page && f.checkType === 'target-unverified',
        );

        if (unverifiedCount > 0) {
          // Property: any unverified target MUST produce a blocking failure
          expect(targetFailures.length).toBeGreaterThan(0);
          // Each unverified target should produce exactly one failure
          expect(targetFailures.length).toBe(unverifiedCount);
        } else {
          // All targets verified → no target-unverified failures
          expect(targetFailures.length).toBe(0);
        }
      }),
      { numRuns: 150 },
    );
  });

  it('unverified default target always produces a failure', () => {
    fc.assert(
      fc.property(
        arbPagePath,
        fc.array(
          fc.record({ name: arbTargetName, verified: fc.boolean() }),
          { minLength: 1, maxLength: 5 },
        ),
        (page, alternatives) => {
          const matrixRecord: MatrixRecord = {
            page,
            owner: 'team-docs',
            verificationTimestamp: '2024-01-15T10:00:00Z',
            targets: {
              defaultTarget: { verified: false },
              alternatives,
            },
          };

          const failures = reconcileAudits([matrixRecord], [], [], [page]);

          const defaultTargetFailures = failures.filter(
            (f) =>
              f.page === page &&
              f.checkType === 'target-unverified' &&
              f.detail.includes('Default target'),
          );

          // Property: unverified default target MUST always produce a failure
          expect(defaultTargetFailures.length).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('each unverified alternative target individually produces a failure', () => {
    fc.assert(
      fc.property(
        arbPagePath,
        fc.array(
          fc.record({ name: arbTargetName, verified: fc.constant(false) }),
          { minLength: 1, maxLength: 5 },
        ),
        (page, alternatives) => {
          const matrixRecord: MatrixRecord = {
            page,
            owner: 'team-docs',
            verificationTimestamp: '2024-01-15T10:00:00Z',
            targets: {
              defaultTarget: { verified: true },
              alternatives,
            },
          };

          const failures = reconcileAudits([matrixRecord], [], [], [page]);

          const altTargetFailures = failures.filter(
            (f) =>
              f.page === page &&
              f.checkType === 'target-unverified' &&
              !f.detail.includes('Default target'),
          );

          // Property: each unverified alternative MUST produce exactly one failure
          expect(altTargetFailures.length).toBe(alternatives.length);

          // Each alternative name should appear in a failure detail
          for (const alt of alternatives) {
            const matchingFailure = altTargetFailures.find((f) =>
              f.detail.includes(alt.name),
            );
            expect(matchingFailure).toBeDefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all targets verified produces no target-unverified failures', () => {
    fc.assert(
      fc.property(
        arbPagePath,
        fc.array(
          fc.record({ name: arbTargetName, verified: fc.constant(true) }),
          { minLength: 1, maxLength: 5 },
        ),
        (page, alternatives) => {
          const matrixRecord: MatrixRecord = {
            page,
            owner: 'team-docs',
            verificationTimestamp: '2024-01-15T10:00:00Z',
            targets: {
              defaultTarget: { verified: true },
              alternatives,
            },
          };

          const failures = reconcileAudits([matrixRecord], [], [], [page]);

          const targetFailures = failures.filter(
            (f) => f.page === page && f.checkType === 'target-unverified',
          );

          // Property: all verified → zero target failures
          expect(targetFailures.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
