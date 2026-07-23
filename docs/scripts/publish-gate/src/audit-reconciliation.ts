/**
 * Audit Reconciliation Engine
 *
 * Consumes Canonical_Matrix and Retained_Code_Audit. For each In_Scope_Page,
 * verifies:
 * 1. A complete, approved matrix record exists (with owner and verification timestamp).
 * 2. Every fenced code block maps to an approved Retained_Code_Audit record.
 * 3. No retained block duplicates a Canonical_Procedure.
 * 4. Every `defaultTarget` and each `alternative` target has been verified.
 *
 * Any failure produces a structured record with `page`, `checkType`, `detail`,
 * and `remediation`.
 */

import { readFile } from 'node:fs/promises';
import type { AuditCheckType } from './types.js';

// ─── Data Models ─────────────────────────────────────────────────────────────

/**
 * A record from the Canonical_Matrix representing a single In_Scope_Page's
 * evidence record including ownership, verification, and target information.
 */
export interface MatrixRecord {
  /** In_Scope_Page path */
  page: string;
  /** Accountable person or team */
  owner: string | null;
  /** ISO-8601 timestamp of verification */
  verificationTimestamp: string | null;
  /** Target information for the page */
  targets: {
    defaultTarget: {
      /** Whether the default target has been verified */
      verified: boolean;
    };
    alternatives: Array<{
      /** Alternative target name */
      name: string;
      /** Whether this alternative has been verified */
      verified: boolean;
    }>;
  };
}

/**
 * A record from the Retained_Code_Audit representing a single fenced
 * code block's audit status within a page.
 */
export interface RetainedCodeAuditRecord {
  /** In_Scope_Page path containing this block */
  page: string;
  /** Unique identifier for this fenced code block */
  blockId: string;
  /** Whether the block has been approved by a reviewer */
  approved: boolean;
  /** If this block duplicates a canonical procedure, reference it here */
  canonicalProcedureId?: string;
}

/**
 * A canonical procedure definition that retained blocks should not duplicate.
 */
export interface CanonicalProcedure {
  /** Unique identifier */
  id: string;
  /** The canonical content (used for duplicate detection) */
  content: string;
}

/**
 * A failure record produced when an audit reconciliation check fails.
 */
export interface AuditReconciliationFailure {
  /** In_Scope_Page path */
  page: string;
  /** Type of check that failed */
  checkType: AuditCheckType;
  /** Human-readable explanation of the failure */
  detail: string;
  /** Action needed to resolve the failure */
  remediation: string;
}

// ─── Core Reconciliation Logic (pure, testable) ─────────────────────────────

/**
 * Checks whether a matrix record is complete (has owner and verification timestamp).
 */
function isMatrixRecordComplete(record: MatrixRecord): boolean {
  return (
    record.owner !== null &&
    record.owner.trim().length > 0 &&
    record.verificationTimestamp !== null &&
    record.verificationTimestamp.trim().length > 0
  );
}

/**
 * Reconciles audit records against the canonical matrix, retained code audit,
 * and canonical procedures for a set of pages.
 *
 * This is the main entry point for the audit reconciliation engine's core logic.
 *
 * @param matrixRecords - All Canonical_Matrix records
 * @param retainedCodeRecords - All Retained_Code_Audit records
 * @param canonicalProcedures - All canonical procedure definitions
 * @param pages - The pages to check (typically the 16 In_Scope_Pages)
 * @returns Array of AuditReconciliationFailure for all detected issues
 */
export function reconcileAudits(
  matrixRecords: MatrixRecord[],
  retainedCodeRecords: RetainedCodeAuditRecord[],
  canonicalProcedures: CanonicalProcedure[],
  pages: readonly string[],
): AuditReconciliationFailure[] {
  const failures: AuditReconciliationFailure[] = [];

  // Index matrix records by page for efficient lookup
  const matrixByPage = new Map<string, MatrixRecord>();
  for (const record of matrixRecords) {
    matrixByPage.set(record.page, record);
  }

  // Index retained code records by page
  const retainedByPage = new Map<string, RetainedCodeAuditRecord[]>();
  for (const record of retainedCodeRecords) {
    const existing = retainedByPage.get(record.page) ?? [];
    existing.push(record);
    retainedByPage.set(record.page, existing);
  }

  // Index canonical procedures by ID for duplicate detection
  const canonicalProcedureIds = new Set(canonicalProcedures.map((p) => p.id));

  for (const page of pages) {
    // Check 1: Matrix record exists
    const matrixRecord = matrixByPage.get(page);
    if (!matrixRecord) {
      failures.push({
        page,
        checkType: 'matrix-missing',
        detail: `No Canonical_Matrix record found for page "${page}".`,
        remediation: `Create a complete Canonical_Matrix record for "${page}" with owner and verification timestamp.`,
      });
      // Cannot proceed with further checks for this page without a matrix record
      continue;
    }

    // Check 2: Matrix record is complete (has owner and verification timestamp)
    if (!isMatrixRecordComplete(matrixRecord)) {
      const missingFields: string[] = [];
      if (!matrixRecord.owner || matrixRecord.owner.trim().length === 0) {
        missingFields.push('owner');
      }
      if (
        !matrixRecord.verificationTimestamp ||
        matrixRecord.verificationTimestamp.trim().length === 0
      ) {
        missingFields.push('verificationTimestamp');
      }
      failures.push({
        page,
        checkType: 'matrix-incomplete',
        detail: `Canonical_Matrix record for "${page}" is missing required fields: ${missingFields.join(', ')}.`,
        remediation: `Complete the matrix record by adding: ${missingFields.join(', ')}.`,
      });
    }

    // Check 3: Every fenced code block maps to an approved Retained_Code_Audit record
    const retainedRecords = retainedByPage.get(page) ?? [];
    for (const record of retainedRecords) {
      // Check 3a: Block must be approved
      if (!record.approved) {
        failures.push({
          page,
          checkType: 'fence-unapproved',
          detail: `Fenced code block "${record.blockId}" in "${page}" is not approved.`,
          remediation: `Get reviewer approval for block "${record.blockId}" or remove the block.`,
        });
      }

      // Check 4: No retained block duplicates a Canonical_Procedure
      if (
        record.canonicalProcedureId &&
        canonicalProcedureIds.has(record.canonicalProcedureId)
      ) {
        failures.push({
          page,
          checkType: 'procedure-duplicate',
          detail: `Retained block "${record.blockId}" in "${page}" duplicates Canonical_Procedure "${record.canonicalProcedureId}".`,
          remediation: `Remove the duplicate block "${record.blockId}" or document why it diverges from the canonical procedure.`,
        });
      }
    }

    // Check 5: Every defaultTarget and each alternative target has verified status
    if (matrixRecord.targets) {
      if (!matrixRecord.targets.defaultTarget.verified) {
        failures.push({
          page,
          checkType: 'target-unverified',
          detail: `Default target for "${page}" has not been verified.`,
          remediation: `Verify the default target for "${page}" and mark it as verified.`,
        });
      }

      for (const alt of matrixRecord.targets.alternatives) {
        if (!alt.verified) {
          failures.push({
            page,
            checkType: 'target-unverified',
            detail: `Alternative target "${alt.name}" for "${page}" has not been verified.`,
            remediation: `Verify alternative target "${alt.name}" for "${page}" and mark it as verified.`,
          });
        }
      }
    }
  }

  return failures;
}

/**
 * Checks that every fenced code block in the provided list of block IDs
 * has a corresponding Retained_Code_Audit record. Blocks without a record
 * are reported as "fence-unrecorded".
 *
 * This is separated from the main reconciliation because fenced block
 * discovery depends on page content parsing (which happens externally).
 *
 * @param page - The page path being checked
 * @param fencedBlockIds - Block IDs discovered in the page's MDX content
 * @param retainedCodeRecords - Retained_Code_Audit records for this page
 * @returns Array of failures for any unrecorded blocks
 */
export function checkUnrecordedFences(
  page: string,
  fencedBlockIds: string[],
  retainedCodeRecords: RetainedCodeAuditRecord[],
): AuditReconciliationFailure[] {
  const failures: AuditReconciliationFailure[] = [];

  const recordedBlockIds = new Set(retainedCodeRecords.map((r) => r.blockId));

  for (const blockId of fencedBlockIds) {
    if (!recordedBlockIds.has(blockId)) {
      failures.push({
        page,
        checkType: 'fence-unrecorded',
        detail: `Fenced code block "${blockId}" in "${page}" has no Retained_Code_Audit record.`,
        remediation: `Audit the fenced block "${blockId}" and create a Retained_Code_Audit record, or remove the block.`,
      });
    }
  }

  return failures;
}

// ─── File-loading Wrapper ───────────────────────────────────────────────────

/**
 * Loads audit reconciliation inputs from JSON files and runs the reconciliation.
 * This is a convenience wrapper for CLI/script usage.
 *
 * @param matrixPath - Path to the Canonical_Matrix JSON file
 * @param retainedCodePath - Path to the Retained_Code_Audit JSON file
 * @param canonicalProceduresPath - Path to the canonical procedures JSON file (optional)
 * @param pages - The pages to check (defaults to IN_SCOPE_PAGES)
 * @returns Array of AuditReconciliationFailure
 */
export async function reconcileAuditsFromFiles(
  matrixPath: string,
  retainedCodePath: string,
  canonicalProceduresPath?: string,
  pages?: readonly string[],
): Promise<AuditReconciliationFailure[]> {
  const { IN_SCOPE_PAGES } = await import('./types.js');
  const pagesToCheck = pages ?? IN_SCOPE_PAGES;

  const [matrixRaw, retainedRaw] = await Promise.all([
    readFile(matrixPath, 'utf-8'),
    readFile(retainedCodePath, 'utf-8'),
  ]);

  const matrixRecords: MatrixRecord[] = JSON.parse(matrixRaw);
  const retainedCodeRecords: RetainedCodeAuditRecord[] = JSON.parse(retainedRaw);

  let canonicalProcedures: CanonicalProcedure[] = [];
  if (canonicalProceduresPath) {
    const proceduresRaw = await readFile(canonicalProceduresPath, 'utf-8');
    canonicalProcedures = JSON.parse(proceduresRaw);
  }

  return reconcileAudits(matrixRecords, retainedCodeRecords, canonicalProcedures, pagesToCheck);
}
