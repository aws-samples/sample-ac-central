/**
 * Property-based test: Audit completeness enforcement (Property 2)
 *
 * **Validates: Requirements 1.3, 2.2**
 *
 * For any In_Scope_Page, if either its Canonical_Matrix record or any applicable
 * Retained_Code_Audit record is missing, incomplete (lacking owner or verification
 * timestamp), or unapproved, then the audit reconciliation SHALL produce a blocking
 * failure identifying the specific deficiency.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  reconcileAudits,
  checkUnrecordedFences,
  type MatrixRecord,
  type RetainedCodeAuditRecord,
  type CanonicalProcedure,
} from './audit-reconciliation.js';
import { IN_SCOPE_PAGES } from './types.js';

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a non-empty string suitable for owner names. */
const arbOwner = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-'.split('')),
  { minLength: 1, maxLength: 20 },
);

/** Generate a valid ISO-8601 timestamp string. */
const arbTimestamp = fc.date({
  min: new Date('2023-01-01'),
  max: new Date('2025-12-31'),
}).map((d) => d.toISOString());

/** Generate a block ID. */
const arbBlockId = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
  { minLength: 3, maxLength: 15 },
).map((s) => `block-${s}`);

/**
 * Deficiency type for a matrix record: can be missing entirely,
 * missing owner, missing verification timestamp, or both missing.
 */
type MatrixDeficiency = 'missing' | 'no-owner' | 'no-timestamp' | 'no-owner-no-timestamp' | 'empty-owner' | 'empty-timestamp';

const arbMatrixDeficiency: fc.Arbitrary<MatrixDeficiency> = fc.constantFrom(
  'missing',
  'no-owner',
  'no-timestamp',
  'no-owner-no-timestamp',
  'empty-owner',
  'empty-timestamp',
);

/** Deficiency type for a retained code audit record. */
type RetainedCodeDeficiency = 'unrecorded' | 'unapproved';

const arbRetainedCodeDeficiency: fc.Arbitrary<RetainedCodeDeficiency> = fc.constantFrom(
  'unrecorded',
  'unapproved',
);

/**
 * Generate a complete, valid MatrixRecord for a given page.
 */
function makeValidMatrixRecord(page: string, owner: string, timestamp: string): MatrixRecord {
  return {
    page,
    owner,
    verificationTimestamp: timestamp,
    targets: {
      defaultTarget: { verified: true },
      alternatives: [],
    },
  };
}

/**
 * Generate a deficient MatrixRecord based on the deficiency type.
 */
function makeDeficientMatrixRecord(page: string, deficiency: MatrixDeficiency): MatrixRecord | null {
  switch (deficiency) {
    case 'missing':
      return null; // No record at all
    case 'no-owner':
      return {
        page,
        owner: null,
        verificationTimestamp: '2024-06-15T00:00:00Z',
        targets: { defaultTarget: { verified: true }, alternatives: [] },
      };
    case 'no-timestamp':
      return {
        page,
        owner: 'valid-owner',
        verificationTimestamp: null,
        targets: { defaultTarget: { verified: true }, alternatives: [] },
      };
    case 'no-owner-no-timestamp':
      return {
        page,
        owner: null,
        verificationTimestamp: null,
        targets: { defaultTarget: { verified: true }, alternatives: [] },
      };
    case 'empty-owner':
      return {
        page,
        owner: '   ',
        verificationTimestamp: '2024-06-15T00:00:00Z',
        targets: { defaultTarget: { verified: true }, alternatives: [] },
      };
    case 'empty-timestamp':
      return {
        page,
        owner: 'valid-owner',
        verificationTimestamp: '   ',
        targets: { defaultTarget: { verified: true }, alternatives: [] },
      };
  }
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 2: Audit completeness enforcement', () => {
  it('missing or incomplete matrix records always produce a blocking failure', () => {
    fc.assert(
      fc.property(
        // Select a random non-empty subset of pages to make deficient
        fc.subarray([...IN_SCOPE_PAGES], { minLength: 1, maxLength: 16 }),
        // For each deficient page, pick a deficiency type
        fc.array(arbMatrixDeficiency, { minLength: 1, maxLength: 16 }),
        // Valid owner and timestamp for the non-deficient pages
        arbOwner,
        arbTimestamp,
        (deficientPages, deficiencies, validOwner, validTimestamp) => {
          // Trim deficiencies to match deficientPages length
          const trimmedDeficiencies = deficiencies.slice(0, deficientPages.length);

          // Build full 16-page inventory
          const matrixRecords: MatrixRecord[] = [];
          const deficientPageSet = new Set(deficientPages);

          for (const page of IN_SCOPE_PAGES) {
            if (deficientPageSet.has(page)) {
              const idx = deficientPages.indexOf(page);
              const deficiency = trimmedDeficiencies[idx] ?? 'missing';
              const record = makeDeficientMatrixRecord(page, deficiency);
              if (record !== null) {
                matrixRecords.push(record);
              }
              // If 'missing', we simply don't add a record
            } else {
              // Valid record for non-deficient pages
              matrixRecords.push(makeValidMatrixRecord(page, validOwner, validTimestamp));
            }
          }

          // No retained code records or canonical procedures needed for this check
          const retainedCodeRecords: RetainedCodeAuditRecord[] = [];
          const canonicalProcedures: CanonicalProcedure[] = [];

          const failures = reconcileAudits(
            matrixRecords,
            retainedCodeRecords,
            canonicalProcedures,
            IN_SCOPE_PAGES,
          );

          // Property: every deficient page MUST have at least one failure
          for (const page of deficientPages) {
            const pageFailures = failures.filter((f) => f.page === page);
            expect(
              pageFailures.length,
              `Page "${page}" should have at least one failure but had none`,
            ).toBeGreaterThan(0);

            // Verify the failure type matches the deficiency
            const idx = deficientPages.indexOf(page);
            const deficiency = trimmedDeficiencies[idx] ?? 'missing';

            if (deficiency === 'missing') {
              expect(pageFailures.some((f) => f.checkType === 'matrix-missing')).toBe(true);
            } else {
              // All other deficiencies produce 'matrix-incomplete'
              expect(pageFailures.some((f) => f.checkType === 'matrix-incomplete')).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('unapproved retained code audit records always produce a blocking failure', () => {
    fc.assert(
      fc.property(
        // Pick 1-4 pages to have unapproved blocks
        fc.subarray([...IN_SCOPE_PAGES], { minLength: 1, maxLength: 4 }),
        // Number of unapproved blocks per page (1-3)
        fc.array(fc.integer({ min: 1, max: 3 }), { minLength: 1, maxLength: 4 }),
        arbOwner,
        arbTimestamp,
        (pagesWithUnapproved, blockCounts, validOwner, validTimestamp) => {
          const trimmedCounts = blockCounts.slice(0, pagesWithUnapproved.length);

          // Build complete matrix records for all pages
          const matrixRecords: MatrixRecord[] = IN_SCOPE_PAGES.map((page) =>
            makeValidMatrixRecord(page, validOwner, validTimestamp),
          );

          // Build retained code records with unapproved blocks for selected pages
          const retainedCodeRecords: RetainedCodeAuditRecord[] = [];

          for (let i = 0; i < pagesWithUnapproved.length; i++) {
            const page = pagesWithUnapproved[i];
            const count = trimmedCounts[i] ?? 1;

            for (let j = 0; j < count; j++) {
              retainedCodeRecords.push({
                page,
                blockId: `block-${i}-${j}`,
                approved: false, // Unapproved
              });
            }
          }

          const canonicalProcedures: CanonicalProcedure[] = [];

          const failures = reconcileAudits(
            matrixRecords,
            retainedCodeRecords,
            canonicalProcedures,
            IN_SCOPE_PAGES,
          );

          // Property: every page with unapproved blocks must produce a fence-unapproved failure
          for (const page of pagesWithUnapproved) {
            const pageFailures = failures.filter(
              (f) => f.page === page && f.checkType === 'fence-unapproved',
            );
            expect(
              pageFailures.length,
              `Page "${page}" should have fence-unapproved failure(s)`,
            ).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('unrecorded fenced blocks always produce a blocking failure', () => {
    fc.assert(
      fc.property(
        // Pick a random page
        fc.constantFrom(...IN_SCOPE_PAGES),
        // Generate 1-5 fenced block IDs present in the page content
        fc.array(arbBlockId, { minLength: 1, maxLength: 5 }),
        // Randomly select a non-empty subset of those blocks to leave unrecorded
        fc.nat({ max: 100 }),
        (page, allBlockIds, seed) => {
          // Deduplicate block IDs
          const uniqueBlockIds = [...new Set(allBlockIds)];
          if (uniqueBlockIds.length === 0) return; // Skip degenerate case

          // Determine which blocks are unrecorded (at least one)
          const unrecordedCount = (seed % uniqueBlockIds.length) + 1;
          const unrecordedBlocks = uniqueBlockIds.slice(0, unrecordedCount);
          const recordedBlocks = uniqueBlockIds.slice(unrecordedCount);

          // Create retained code records only for the recorded blocks
          const retainedCodeRecords: RetainedCodeAuditRecord[] = recordedBlocks.map((blockId) => ({
            page,
            blockId,
            approved: true,
          }));

          const failures = checkUnrecordedFences(page, uniqueBlockIds, retainedCodeRecords);

          // Property: every unrecorded block produces a fence-unrecorded failure
          for (const blockId of unrecordedBlocks) {
            const blockFailures = failures.filter(
              (f) => f.page === page && f.checkType === 'fence-unrecorded' && f.detail.includes(blockId),
            );
            expect(
              blockFailures.length,
              `Block "${blockId}" in page "${page}" should produce a fence-unrecorded failure`,
            ).toBeGreaterThan(0);
          }

          // And no failures for recorded blocks
          for (const blockId of recordedBlocks) {
            const blockFailures = failures.filter(
              (f) => f.page === page && f.detail.includes(blockId),
            );
            expect(
              blockFailures.length,
              `Recorded block "${blockId}" should NOT produce a failure`,
            ).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('complete and approved records produce no failures for those pages', () => {
    fc.assert(
      fc.property(
        arbOwner,
        arbTimestamp,
        // Random number of approved blocks per page (0-3)
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 16, maxLength: 16 }),
        (validOwner, validTimestamp, blockCountsPerPage) => {
          // Build complete, valid matrix records for all 16 pages
          const matrixRecords: MatrixRecord[] = IN_SCOPE_PAGES.map((page) =>
            makeValidMatrixRecord(page, validOwner, validTimestamp),
          );

          // Build approved retained code records
          const retainedCodeRecords: RetainedCodeAuditRecord[] = [];
          for (let i = 0; i < IN_SCOPE_PAGES.length; i++) {
            const page = IN_SCOPE_PAGES[i];
            const count = blockCountsPerPage[i];
            for (let j = 0; j < count; j++) {
              retainedCodeRecords.push({
                page,
                blockId: `block-${i}-${j}`,
                approved: true, // All approved
              });
            }
          }

          const canonicalProcedures: CanonicalProcedure[] = [];

          const failures = reconcileAudits(
            matrixRecords,
            retainedCodeRecords,
            canonicalProcedures,
            IN_SCOPE_PAGES,
          );

          // Property: no failures when all records are complete and approved
          expect(failures.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
