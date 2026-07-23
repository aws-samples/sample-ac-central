/**
 * Fixture tests for the Audit Reconciliation Engine (F04–F10).
 *
 * These are deterministic tests with specific known inputs and expected outputs,
 * validating Requirements 1.3, 1.4, and 2.2: matrix completeness, target verification,
 * and retained-code enforcement.
 *
 * Validates: Requirements 1.3, 1.4, 2.2
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
    verificationTimestamp: '2024-06-15T10:00:00Z',
    targets: {
      defaultTarget: { verified: true },
      alternatives: [],
    },
    ...overrides,
  };
}

function createRetainedCodeRecord(
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

// ─── F04: Matrix record missing for one page → fail ──────────────────────────

describe('F04: Matrix record missing for one page → fail', () => {
  it('produces a matrix-missing failure when no matrix record exists for a page', () => {
    const pages = ['get-started/overview', 'get-started/preflight'] as const;

    // Only provide a matrix record for the first page
    const matrixRecords: MatrixRecord[] = [
      createCompleteMatrixRecord('get-started/overview'),
    ];

    const failures = reconcileAudits(matrixRecords, [], [], pages);

    // The second page should have a matrix-missing failure
    const missingFailures = failures.filter(
      (f) => f.checkType === 'matrix-missing' && f.page === 'get-started/preflight',
    );
    expect(missingFailures).toHaveLength(1);
    expect(missingFailures[0].detail).toContain('get-started/preflight');
    expect(missingFailures[0].detail).toContain('No Canonical_Matrix record found');
    expect(missingFailures[0].remediation).toContain('Create a complete Canonical_Matrix record');

    // The first page should have no failures
    const firstPageFailures = failures.filter((f) => f.page === 'get-started/overview');
    expect(firstPageFailures).toHaveLength(0);
  });
});

// ─── F05: Matrix record present but missing owner → fail ─────────────────────

describe('F05: Matrix record present but missing owner → fail', () => {
  it('produces a matrix-incomplete failure when owner is null', () => {
    const pages = ['tutorials/overview'] as const;

    const matrixRecords: MatrixRecord[] = [
      createCompleteMatrixRecord('tutorials/overview', { owner: null }),
    ];

    const failures = reconcileAudits(matrixRecords, [], [], pages);

    const incompleteFailures = failures.filter((f) => f.checkType === 'matrix-incomplete');
    expect(incompleteFailures).toHaveLength(1);
    expect(incompleteFailures[0].page).toBe('tutorials/overview');
    expect(incompleteFailures[0].detail).toContain('owner');
    expect(incompleteFailures[0].remediation).toContain('owner');
  });
});

// ─── F06: All targets verified → pass ────────────────────────────────────────

describe('F06: All targets verified → pass', () => {
  it('produces no target-unverified failures when all targets are verified', () => {
    const pages = ['workloads/conversational/quickstart'] as const;

    const matrixRecords: MatrixRecord[] = [
      createCompleteMatrixRecord('workloads/conversational/quickstart', {
        targets: {
          defaultTarget: { verified: true },
          alternatives: [
            { name: 'Claude via Bedrock', verified: true },
            { name: 'GPT-4 via OpenAI', verified: true },
            { name: 'Local Ollama', verified: true },
          ],
        },
      }),
    ];

    const failures = reconcileAudits(matrixRecords, [], [], pages);

    const targetFailures = failures.filter((f) => f.checkType === 'target-unverified');
    expect(targetFailures).toHaveLength(0);

    // Entire reconciliation should produce no failures
    expect(failures).toHaveLength(0);
  });
});

// ─── F07: One alternative target unverified → fail ───────────────────────────

describe('F07: One alternative target unverified → fail', () => {
  it('produces a target-unverified failure when one alternative is not verified', () => {
    const pages = ['workloads/coding/quickstart'] as const;

    const matrixRecords: MatrixRecord[] = [
      createCompleteMatrixRecord('workloads/coding/quickstart', {
        targets: {
          defaultTarget: { verified: true },
          alternatives: [
            { name: 'VS Code Extension', verified: true },
            { name: 'JetBrains Plugin', verified: false },
            { name: 'Neovim Integration', verified: true },
          ],
        },
      }),
    ];

    const failures = reconcileAudits(matrixRecords, [], [], pages);

    const targetFailures = failures.filter((f) => f.checkType === 'target-unverified');
    expect(targetFailures).toHaveLength(1);
    expect(targetFailures[0].page).toBe('workloads/coding/quickstart');
    expect(targetFailures[0].detail).toContain('JetBrains Plugin');
    expect(targetFailures[0].remediation).toContain('Verify alternative target');
  });
});

// ─── F08: Fenced block with no audit record → fail ───────────────────────────

describe('F08: Fenced block with no audit record → fail', () => {
  it('produces a fence-unrecorded failure for a block without an audit record', () => {
    const page = 'get-started/quickstart';
    const fencedBlockIds = ['install-strands-sdk', 'create-first-agent', 'run-agent'];

    // Only provide audit records for 2 of the 3 blocks
    const retainedRecords: RetainedCodeAuditRecord[] = [
      createRetainedCodeRecord(page, 'install-strands-sdk'),
      createRetainedCodeRecord(page, 'create-first-agent'),
      // 'run-agent' has no record
    ];

    const failures = checkUnrecordedFences(page, fencedBlockIds, retainedRecords);

    expect(failures).toHaveLength(1);
    expect(failures[0].checkType).toBe('fence-unrecorded');
    expect(failures[0].page).toBe('get-started/quickstart');
    expect(failures[0].detail).toContain('run-agent');
    expect(failures[0].detail).toContain('no Retained_Code_Audit record');
    expect(failures[0].remediation).toContain('Audit the fenced block');
  });
});

// ─── F09: Fenced block with `approved: false` → fail ─────────────────────────

describe('F09: Fenced block with approved: false → fail', () => {
  it('produces a fence-unapproved failure for a block that is not approved', () => {
    const pages = ['tutorials/add-memory'] as const;

    const matrixRecords: MatrixRecord[] = [
      createCompleteMatrixRecord('tutorials/add-memory'),
    ];

    const retainedRecords: RetainedCodeAuditRecord[] = [
      createRetainedCodeRecord('tutorials/add-memory', 'memory-setup-code', { approved: true }),
      createRetainedCodeRecord('tutorials/add-memory', 'memory-query-code', { approved: false }),
    ];

    const failures = reconcileAudits(matrixRecords, retainedRecords, [], pages);

    const unapprovedFailures = failures.filter((f) => f.checkType === 'fence-unapproved');
    expect(unapprovedFailures).toHaveLength(1);
    expect(unapprovedFailures[0].page).toBe('tutorials/add-memory');
    expect(unapprovedFailures[0].detail).toContain('memory-query-code');
    expect(unapprovedFailures[0].detail).toContain('not approved');
    expect(unapprovedFailures[0].remediation).toContain('approval');
  });
});

// ─── F10: Retained block duplicating a Canonical_Procedure → fail ────────────

describe('F10: Retained block duplicating a Canonical_Procedure → fail', () => {
  it('produces a procedure-duplicate failure when a retained block duplicates a canonical procedure', () => {
    const pages = ['get-started/firstagent'] as const;

    const matrixRecords: MatrixRecord[] = [
      createCompleteMatrixRecord('get-started/firstagent'),
    ];

    const retainedRecords: RetainedCodeAuditRecord[] = [
      createRetainedCodeRecord('get-started/firstagent', 'agent-init-block', {
        approved: true,
        canonicalProcedureId: 'proc-install-strands-agents',
      }),
    ];

    const canonicalProcedures: CanonicalProcedure[] = [
      { id: 'proc-install-strands-agents', content: 'pip install strands-agents' },
      { id: 'proc-configure-bedrock', content: 'aws configure' },
    ];

    const failures = reconcileAudits(matrixRecords, retainedRecords, canonicalProcedures, pages);

    const duplicateFailures = failures.filter((f) => f.checkType === 'procedure-duplicate');
    expect(duplicateFailures).toHaveLength(1);
    expect(duplicateFailures[0].page).toBe('get-started/firstagent');
    expect(duplicateFailures[0].detail).toContain('agent-init-block');
    expect(duplicateFailures[0].detail).toContain('proc-install-strands-agents');
    expect(duplicateFailures[0].remediation).toContain('Remove the duplicate block');
  });
});
