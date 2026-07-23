/**
 * Property-based test: Exception record completeness (Property 4)
 *
 * **Validates: Requirements 2.3**
 *
 * For any non-passing target or approved exception, the corresponding
 * Publication_Audit entry SHALL contain all required fields (owner, reason,
 * verification date, expiry date, publish-blocking decision). A record
 * missing any required field SHALL be rejected.
 *
 * Generator Strategy: Generate Publication_Audit entries with random subsets
 * of required fields missing. Verify records missing any required field are rejected.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  isValidExceptionRef,
  validateExceptionRecords,
  REQUIRED_EXCEPTION_FIELDS,
} from './publication-audit.js';
import type { ApprovedExceptionRef } from './types.js';

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a non-empty string suitable for exception fields. */
const arbNonEmptyString = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_/.'.split('')),
  { minLength: 1, maxLength: 50 },
);

/** Generate a valid ISO-8601 date string for expiryDate. */
const arbIsoDate = fc
  .date({ min: new Date('2024-01-01'), max: new Date('2030-12-31') })
  .map((d) => d.toISOString().split('T')[0]);

/** Generate a valid exception ID (e.g., "exc-001", "EXC-abc-123"). */
const arbExceptionId = fc.tuple(
  fc.constantFrom('exc', 'EXC', 'exception'),
  fc.stringOf(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 3, maxLength: 8 }),
).map(([prefix, suffix]) => `${prefix}-${suffix}`);

/** Generate a valid field name for what the exception covers. */
const arbField = fc.constantFrom(
  'emittedRoute',
  'sidebarCategory',
  'sidebarLabel',
  'sidebarOrder',
  'documentId',
  'linkValidatorResult',
  'contentValidationResult',
);

/** Generate a valid approval reference (ticket or review link). */
const arbApprovalReference = fc.tuple(
  fc.constantFrom('TICKET-', 'REVIEW-', 'CR-', 'ISSUE-'),
  fc.integer({ min: 100, max: 99999 }),
).map(([prefix, num]) => `${prefix}${num}`);

/** Generate a valid reason string. */
const arbReason = fc.constantFrom(
  'Known redirect in progress',
  'Planned sidebar reorganization',
  'Legacy label retained for backward compatibility',
  'External link temporarily unavailable',
  'Approved deviation from baseline',
  'Route change approved by docs team',
);

/** Generate a complete, valid ApprovedExceptionRef. */
const arbCompleteException: fc.Arbitrary<ApprovedExceptionRef> = fc.record({
  exceptionId: arbExceptionId,
  field: arbField,
  owner: arbNonEmptyString,
  reason: arbReason,
  approvalReference: arbApprovalReference,
  expiryDate: arbIsoDate,
  publishBlocking: fc.boolean(),
});

/**
 * Generate a subset of required field names to remove.
 * Ensures at least one field is removed (to guarantee the record is incomplete).
 */
const arbFieldsToRemove = fc.subarray(
  [...REQUIRED_EXCEPTION_FIELDS, 'publishBlocking'] as string[],
  { minLength: 1 },
);

/**
 * Generate an "empty-like" value used to corrupt a field.
 * These represent various ways a field can be "missing" in practice:
 * null, undefined, empty string, whitespace-only.
 */
const arbEmptyValue = fc.constantFrom(null, undefined, '', ' ', '\t', '\n', '  ');

/**
 * Strategy for making a field invalid: either remove it entirely
 * or set it to an empty/whitespace value.
 */
const arbCorruptionStrategy = fc.constantFrom('remove', 'empty');

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 4: Exception record completeness', () => {
  it('a complete record with all required fields is accepted', () => {
    fc.assert(
      fc.property(arbCompleteException, (exception) => {
        // A complete, valid record should pass validation
        expect(isValidExceptionRef(exception)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('a record with any required string field removed is rejected', () => {
    fc.assert(
      fc.property(
        arbCompleteException,
        arbFieldsToRemove,
        (exception, fieldsToRemove) => {
          // Create a mutable copy and remove selected fields
          const corrupted: Record<string, unknown> = { ...exception };

          // Only remove string fields for this test (publishBlocking handled separately)
          const stringFieldsToRemove = fieldsToRemove.filter(
            (f) => f !== 'publishBlocking',
          );

          if (stringFieldsToRemove.length === 0 && !fieldsToRemove.includes('publishBlocking')) {
            // If only publishBlocking selected but filtered out, skip
            return;
          }

          for (const field of stringFieldsToRemove) {
            delete corrupted[field];
          }

          if (fieldsToRemove.includes('publishBlocking')) {
            delete corrupted.publishBlocking;
          }

          // Record missing any required field must be rejected
          expect(isValidExceptionRef(corrupted)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a record with any required string field set to empty/whitespace is rejected', () => {
    fc.assert(
      fc.property(
        arbCompleteException,
        fc.subarray([...REQUIRED_EXCEPTION_FIELDS] as string[], { minLength: 1 }),
        arbEmptyValue,
        (exception, fieldsToCorrupt, emptyValue) => {
          // Create a mutable copy and set selected fields to empty values
          const corrupted: Record<string, unknown> = { ...exception };

          for (const field of fieldsToCorrupt) {
            corrupted[field] = emptyValue;
          }

          // Record with empty required fields must be rejected
          expect(isValidExceptionRef(corrupted)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a record with publishBlocking set to non-boolean is rejected', () => {
    fc.assert(
      fc.property(
        arbCompleteException,
        fc.constantFrom('true', 'false', 1, 0, null, undefined, 'yes', 'no'),
        (exception, invalidBoolean) => {
          const corrupted: Record<string, unknown> = { ...exception };
          corrupted.publishBlocking = invalidBoolean;

          // Non-boolean publishBlocking must be rejected
          expect(isValidExceptionRef(corrupted)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('validateExceptionRecords rejects a batch when any record is incomplete', () => {
    fc.assert(
      fc.property(
        // Generate a mix of valid and invalid records
        fc.array(arbCompleteException, { minLength: 1, maxLength: 5 }),
        fc.nat({ max: 4 }), // Index of the record to corrupt
        fc.subarray([...REQUIRED_EXCEPTION_FIELDS] as string[], { minLength: 1 }),
        (exceptions, corruptIndex, fieldsToRemove) => {
          const actualIndex = corruptIndex % exceptions.length;
          const records: Array<Record<string, unknown>> = exceptions.map((e) => ({ ...e }));

          // Corrupt one record by removing fields
          for (const field of fieldsToRemove) {
            delete records[actualIndex][field];
          }

          // The batch must be rejected because at least one record is incomplete
          expect(validateExceptionRecords(records)).toBe(false);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('validateExceptionRecords accepts a batch where all records are complete', () => {
    fc.assert(
      fc.property(
        fc.array(arbCompleteException, { minLength: 1, maxLength: 10 }),
        (exceptions) => {
          // All complete records → batch passes
          expect(validateExceptionRecords(exceptions)).toBe(true);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('records with mixed corruption strategies (remove vs empty) are all rejected', () => {
    fc.assert(
      fc.property(
        arbCompleteException,
        fc.subarray([...REQUIRED_EXCEPTION_FIELDS] as string[], { minLength: 1 }),
        arbCorruptionStrategy,
        arbEmptyValue,
        (exception, fieldsToCorrupt, strategy, emptyValue) => {
          const corrupted: Record<string, unknown> = { ...exception };

          for (const field of fieldsToCorrupt) {
            if (strategy === 'remove') {
              delete corrupted[field];
            } else {
              corrupted[field] = emptyValue;
            }
          }

          // Regardless of corruption strategy, record must be rejected
          expect(isValidExceptionRef(corrupted)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a single missing field is sufficient to reject the record', () => {
    fc.assert(
      fc.property(
        arbCompleteException,
        fc.constantFrom(...REQUIRED_EXCEPTION_FIELDS, 'publishBlocking'),
        (exception, fieldToRemove) => {
          const corrupted: Record<string, unknown> = { ...exception };
          delete corrupted[fieldToRemove];

          // Removing even a single required field must cause rejection
          expect(isValidExceptionRef(corrupted)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
