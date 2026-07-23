/**
 * Unit tests for the Audit Reconciliation Engine.
 *
 * Tests the core reconciliation logic including matrix completeness,
 * retained code audit validation, procedure duplicate detection,
 * and target verification.
 */

import { describe, it, expect } from 'vitest';
import {
  reconcileAudits,
  checkUnrecordedFences,
  type MatrixRecord,
  type RetainedCodeAuditRecord,
  type CanonicalProcedure,
} from './audit-reconciliation.js';

// ─── Helper Factories ────────────────────────────────────────────────────────

function createCompleteMatrixRecord(page: string, overrides?: Partial<MatrixRecord>): MatrixRecord {
  return {
    page,
    owner: 'team-docs',
    verificationTimestamp: '2024-01-15T10:00:00Z',
    targets: {
      defaultTarget: { verified: true },
      alternatives: [],
    },
    ...overrides,
  };
}

function makeRetainedCodeRecord(
  page: string,
  blockId: string,
  overrides?: Partial<RetainedCodeAuditRecord>,
): RetainedCodeAuditRecord {
  return {
    page,
    blockId,
    approved: true,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('reconcileAudits', () => {
  const testPages = ['page-a', 'page-b', 'page-c'] as const;

  describe('matrix record checks', () => {
    it('should produce matrix-missing failure when no matrix record exists for a page', () => {
      const matrixRecords: MatrixRecord[] = [];
      const retainedRecords: RetainedCodeAuditRecord[] = [];
      const procedures: CanonicalProcedure[] = [];

      const failures = reconcileAudits(matrixRecords, retainedRecords, procedures, testPages);

      const missingFailures = failures.filter((f) => f.checkType === 'matrix-missing');
      expect(missingFailures).toHaveLength(3);
      expect(missingFailures[0].page).toBe('page-a');
      expect(missingFailures[0].detail).toContain('No Canonical_Matrix record found');
      expect(missingFailures[0].remediation).toContain('Create a complete Canonical_Matrix record');
    });

    it('should produce matrix-incomplete failure when owner is missing', () => {
      const matrixRecords: MatrixRecord[] = [
        createCompleteMatrixRecord('page-a', { owner: null }),
      ];

      const failures = reconcileAudits(matrixRecords, [], [], ['page-a']);

      const incompleteFailures = failures.filter((f) => f.checkType === 'matrix-incomplete');
      expect(incompleteFailures).toHaveLength(1);
      expect(incompleteFailures[0].detail).toContain('owner');
    });

    it('should produce matrix-incomplete failure when owner is empty string', () => {
      const matrixRecords: MatrixRecord[] = [
        createCompleteMatrixRecord('page-a', { owner: '  ' }),
      ];

      const failures = reconcileAudits(matrixRecords, [], [], ['page-a']);

      const incompleteFailures = failures.filter((f) => f.checkType === 'matrix-incomplete');
      expect(incompleteFailures).toHaveLength(1);
      expect(incompleteFailures[0].detail).toContain('owner');
    });

    it('should produce matrix-incomplete failure when verificationTimestamp is missing', () => {
      const matrixRecords: MatrixRecord[] = [
        createCompleteMatrixRecord('page-a', { verificationTimestamp: null }),
      ];

      const failures = reconcileAudits(matrixRecords, [], [], ['page-a']);

      const incompleteFailures = failures.filter((f) => f.checkType === 'matrix-incomplete');
      expect(incompleteFailures).toHaveLength(1);
      expect(incompleteFailures[0].detail).toContain('verificationTimestamp');
    });

    it('should produce matrix-incomplete failure when both owner and timestamp are missing', () => {
      const matrixRecords: MatrixRecord[] = [
        createCompleteMatrixRecord('page-a', { owner: null, verificationTimestamp: null }),
      ];

      const failures = reconcileAudits(matrixRecords, [], [], ['page-a']);

      const incompleteFailures = failures.filter((f) => f.checkType === 'matrix-incomplete');
      expect(incompleteFailures).toHaveLength(1);
      expect(incompleteFailures[0].detail).toContain('owner');
      expect(incompleteFailures[0].detail).toContain('verificationTimestamp');
    });

    it('should not produce failures for a complete matrix record', () => {
      const matrixRecords: MatrixRecord[] = [createCompleteMatrixRecord('page-a')];

      const failures = reconcileAudits(matrixRecords, [], [], ['page-a']);

      const matrixFailures = failures.filter(
        (f) => f.checkType === 'matrix-missing' || f.checkType === 'matrix-incomplete',
      );
      expect(matrixFailures).toHaveLength(0);
    });
  });

  describe('retained code audit checks', () => {
    it('should produce fence-unapproved failure for unapproved blocks', () => {
      const matrixRecords: MatrixRecord[] = [createCompleteMatrixRecord('page-a')];
      const retainedRecords: RetainedCodeAuditRecord[] = [
        makeRetainedCodeRecord('page-a', 'block-1', { approved: false }),
      ];

      const failures = reconcileAudits(matrixRecords, retainedRecords, [], ['page-a']);

      const unapprovedFailures = failures.filter((f) => f.checkType === 'fence-unapproved');
      expect(unapprovedFailures).toHaveLength(1);
      expect(unapprovedFailures[0].detail).toContain('block-1');
      expect(unapprovedFailures[0].detail).toContain('not approved');
    });

    it('should not produce failures for approved blocks', () => {
      const matrixRecords: MatrixRecord[] = [createCompleteMatrixRecord('page-a')];
      const retainedRecords: RetainedCodeAuditRecord[] = [
        makeRetainedCodeRecord('page-a', 'block-1', { approved: true }),
      ];

      const failures = reconcileAudits(matrixRecords, retainedRecords, [], ['page-a']);

      const fenceFailures = failures.filter(
        (f) => f.checkType === 'fence-unapproved' || f.checkType === 'fence-unrecorded',
      );
      expect(fenceFailures).toHaveLength(0);
    });
  });

  describe('procedure duplicate checks', () => {
    it('should produce procedure-duplicate failure when a retained block duplicates a canonical procedure', () => {
      const matrixRecords: MatrixRecord[] = [createCompleteMatrixRecord('page-a')];
      const retainedRecords: RetainedCodeAuditRecord[] = [
        makeRetainedCodeRecord('page-a', 'block-1', {
          approved: true,
          canonicalProcedureId: 'proc-install-agent',
        }),
      ];
      const procedures: CanonicalProcedure[] = [
        { id: 'proc-install-agent', content: 'pip install strands-agents' },
      ];

      const failures = reconcileAudits(matrixRecords, retainedRecords, procedures, ['page-a']);

      const duplicateFailures = failures.filter((f) => f.checkType === 'procedure-duplicate');
      expect(duplicateFailures).toHaveLength(1);
      expect(duplicateFailures[0].detail).toContain('block-1');
      expect(duplicateFailures[0].detail).toContain('proc-install-agent');
    });

    it('should not flag a block referencing a non-existent canonical procedure', () => {
      const matrixRecords: MatrixRecord[] = [createCompleteMatrixRecord('page-a')];
      const retainedRecords: RetainedCodeAuditRecord[] = [
        makeRetainedCodeRecord('page-a', 'block-1', {
          approved: true,
          canonicalProcedureId: 'proc-nonexistent',
        }),
      ];
      const procedures: CanonicalProcedure[] = [
        { id: 'proc-install-agent', content: 'pip install strands-agents' },
      ];

      const failures = reconcileAudits(matrixRecords, retainedRecords, procedures, ['page-a']);

      const duplicateFailures = failures.filter((f) => f.checkType === 'procedure-duplicate');
      expect(duplicateFailures).toHaveLength(0);
    });

    it('should not flag a block without canonicalProcedureId', () => {
      const matrixRecords: MatrixRecord[] = [createCompleteMatrixRecord('page-a')];
      const retainedRecords: RetainedCodeAuditRecord[] = [
        makeRetainedCodeRecord('page-a', 'block-1', { approved: true }),
      ];
      const procedures: CanonicalProcedure[] = [
        { id: 'proc-install-agent', content: 'pip install strands-agents' },
      ];

      const failures = reconcileAudits(matrixRecords, retainedRecords, procedures, ['page-a']);

      const duplicateFailures = failures.filter((f) => f.checkType === 'procedure-duplicate');
      expect(duplicateFailures).toHaveLength(0);
    });
  });

  describe('target verification checks', () => {
    it('should produce target-unverified failure when defaultTarget is not verified', () => {
      const matrixRecords: MatrixRecord[] = [
        createCompleteMatrixRecord('page-a', {
          targets: {
            defaultTarget: { verified: false },
            alternatives: [],
          },
        }),
      ];

      const failures = reconcileAudits(matrixRecords, [], [], ['page-a']);

      const targetFailures = failures.filter((f) => f.checkType === 'target-unverified');
      expect(targetFailures).toHaveLength(1);
      expect(targetFailures[0].detail).toContain('Default target');
    });

    it('should produce target-unverified failure when an alternative target is not verified', () => {
      const matrixRecords: MatrixRecord[] = [
        createCompleteMatrixRecord('page-a', {
          targets: {
            defaultTarget: { verified: true },
            alternatives: [
              { name: 'alt-1', verified: true },
              { name: 'alt-2', verified: false },
            ],
          },
        }),
      ];

      const failures = reconcileAudits(matrixRecords, [], [], ['page-a']);

      const targetFailures = failures.filter((f) => f.checkType === 'target-unverified');
      expect(targetFailures).toHaveLength(1);
      expect(targetFailures[0].detail).toContain('alt-2');
    });

    it('should produce multiple target-unverified failures when multiple alternatives are unverified', () => {
      const matrixRecords: MatrixRecord[] = [
        createCompleteMatrixRecord('page-a', {
          targets: {
            defaultTarget: { verified: false },
            alternatives: [
              { name: 'alt-1', verified: false },
              { name: 'alt-2', verified: false },
            ],
          },
        }),
      ];

      const failures = reconcileAudits(matrixRecords, [], [], ['page-a']);

      const targetFailures = failures.filter((f) => f.checkType === 'target-unverified');
      // 1 for default + 2 for alternatives
      expect(targetFailures).toHaveLength(3);
    });

    it('should not produce failures when all targets are verified', () => {
      const matrixRecords: MatrixRecord[] = [
        createCompleteMatrixRecord('page-a', {
          targets: {
            defaultTarget: { verified: true },
            alternatives: [
              { name: 'alt-1', verified: true },
              { name: 'alt-2', verified: true },
            ],
          },
        }),
      ];

      const failures = reconcileAudits(matrixRecords, [], [], ['page-a']);

      const targetFailures = failures.filter((f) => f.checkType === 'target-unverified');
      expect(targetFailures).toHaveLength(0);
    });
  });

  describe('multi-page reconciliation', () => {
    it('should check all pages independently', () => {
      const matrixRecords: MatrixRecord[] = [
        createCompleteMatrixRecord('page-a'),
        // page-b missing
        createCompleteMatrixRecord('page-c', { owner: null }),
      ];

      const failures = reconcileAudits(matrixRecords, [], [], testPages);

      expect(failures.some((f) => f.page === 'page-b' && f.checkType === 'matrix-missing')).toBe(
        true,
      );
      expect(
        failures.some((f) => f.page === 'page-c' && f.checkType === 'matrix-incomplete'),
      ).toBe(true);
      // page-a should have no failures
      expect(failures.filter((f) => f.page === 'page-a')).toHaveLength(0);
    });

    it('should skip further checks for a page with missing matrix record', () => {
      // If matrix is missing, we can't check targets or code blocks
      const retainedRecords: RetainedCodeAuditRecord[] = [
        makeRetainedCodeRecord('page-a', 'block-1', { approved: false }),
      ];

      const failures = reconcileAudits([], retainedRecords, [], ['page-a']);

      // Only matrix-missing, not fence-unapproved
      expect(failures).toHaveLength(1);
      expect(failures[0].checkType).toBe('matrix-missing');
    });
  });

  describe('failure record structure', () => {
    it('should include all required fields in every failure record', () => {
      const matrixRecords: MatrixRecord[] = [];

      const failures = reconcileAudits(matrixRecords, [], [], ['page-a']);

      for (const failure of failures) {
        expect(failure.page).toBeTruthy();
        expect(failure.checkType).toBeTruthy();
        expect(failure.detail).toBeTruthy();
        expect(failure.remediation).toBeTruthy();
      }
    });
  });
});

describe('checkUnrecordedFences', () => {
  it('should produce fence-unrecorded failure for blocks without audit records', () => {
    const fencedBlockIds = ['block-1', 'block-2', 'block-3'];
    const retainedRecords: RetainedCodeAuditRecord[] = [
      makeRetainedCodeRecord('page-a', 'block-1'),
      // block-2 and block-3 have no records
    ];

    const failures = checkUnrecordedFences('page-a', fencedBlockIds, retainedRecords);

    expect(failures).toHaveLength(2);
    expect(failures[0].checkType).toBe('fence-unrecorded');
    expect(failures[0].detail).toContain('block-2');
    expect(failures[1].detail).toContain('block-3');
  });

  it('should produce no failures when all blocks have records', () => {
    const fencedBlockIds = ['block-1', 'block-2'];
    const retainedRecords: RetainedCodeAuditRecord[] = [
      makeRetainedCodeRecord('page-a', 'block-1'),
      makeRetainedCodeRecord('page-a', 'block-2'),
    ];

    const failures = checkUnrecordedFences('page-a', fencedBlockIds, retainedRecords);

    expect(failures).toHaveLength(0);
  });

  it('should produce no failures when there are no fenced blocks', () => {
    const failures = checkUnrecordedFences('page-a', [], []);
    expect(failures).toHaveLength(0);
  });

  it('should include proper remediation in failure records', () => {
    const failures = checkUnrecordedFences('page-a', ['block-x'], []);

    expect(failures[0].remediation).toContain('Audit the fenced block');
    expect(failures[0].remediation).toContain('block-x');
  });
});
