/**
 * Property 8: Expired exception treated as absent
 *
 * For any Approved_Exception record whose expiryDate is in the past relative
 * to gate execution time, the gate SHALL treat that exception as non-existent.
 * Any field change covered only by an expired exception SHALL produce a
 * blocking failure.
 *
 * **Validates: Requirements 1.2, 2.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  comparePageRoutes,
  isExceptionValid,
  findValidException,
  type RouteRecord,
} from './route-comparison.js';
import type { ApprovedException, RouteField } from './types.js';
import { ROUTE_COMPARISON_FIELDS } from './types.js';

// ─── Fixed execution time for deterministic tests ────────────────────────────
// Use midnight UTC so that date-only strings ("YYYY-MM-DD") parse to the same
// time-of-day, avoiding timezone edge cases in expiry comparisons.

const EXECUTION_TIME = new Date('2024-06-15T00:00:00Z');
const EXECUTION_TIME_MS = EXECUTION_TIME.getTime();

// ─── Arbitraries (Generators) ────────────────────────────────────────────────

/** Generate a random In_Scope_Page path */
const arbPage = fc.constantFrom(
  'get-started/overview',
  'get-started/preflight',
  'get-started/quickstart',
  'tutorials/overview',
  'tutorials/add-memory',
  'workloads/overview',
  'workloads/conversational/overview',
  'workloads/coding/overview',
);

/** Generate a random route field name */
const arbRouteField = fc.constantFrom(...ROUTE_COMPARISON_FIELDS);

/** Generate a random field value (simulating route/sidebar content) */
const arbFieldValue = fc.stringOf(
  fc.constantFrom(
    'a', 'b', 'c', '/', '-', '_', ' ',
    'A', 'B', 'C', '1', '2', '3',
  ),
  { minLength: 1, maxLength: 30 },
);

/**
 * Generate an ISO-8601 date string that is strictly in the past
 * relative to EXECUTION_TIME (at least 1 day before).
 * Since EXECUTION_TIME is at midnight and dates parse as midnight,
 * "day before" guarantees the parsed Date < EXECUTION_TIME.
 */
const arbExpiredDate = fc
  .integer({ min: 1, max: 365 * 5 }) // 1 to 1825 days in the past
  .map((daysAgo) => {
    const d = new Date(EXECUTION_TIME_MS - daysAgo * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD format
  });

/**
 * Generate an ISO-8601 date string that is at or after EXECUTION_TIME —
 * i.e., a valid (non-expired) date. Since EXECUTION_TIME is midnight
 * and date-only strings parse as midnight, 0 days ahead gives equality
 * which the code treats as valid (expiryDate >= executionTime).
 */
const arbValidDate = fc
  .integer({ min: 0, max: 365 * 5 }) // 0 to 1825 days in the future
  .map((daysAhead) => {
    const d = new Date(EXECUTION_TIME_MS + daysAhead * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });

/** Generate an Approved_Exception with a specific expiry date */
function arbException(
  page: string,
  field: RouteField | undefined,
  expiryDateArb: fc.Arbitrary<string>,
): fc.Arbitrary<ApprovedException> {
  return fc.record({
    id: fc.uuid(),
    targetOrPage: fc.constant(page),
    field: fc.constant(field),
    owner: fc.string({ minLength: 1, maxLength: 20 }),
    reason: fc.string({ minLength: 1, maxLength: 50 }),
    approvalReference: fc.string({ minLength: 1, maxLength: 30 }),
    expiryDate: expiryDateArb,
    publishBlocking: fc.boolean(),
  });
}

/** Generate a RouteRecord for a given page with specified field values */
function arbRouteRecord(page: string): fc.Arbitrary<RouteRecord> {
  return fc.record({
    page: fc.constant(page),
    documentId: arbFieldValue,
    emittedRoute: arbFieldValue,
    sidebarCategory: arbFieldValue,
    sidebarLabel: arbFieldValue,
    sidebarOrder: arbFieldValue,
  });
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 8: Expired exception treated as absent', () => {
  it('isExceptionValid returns false for any exception with expiry before execution time', () => {
    fc.assert(
      fc.property(
        arbPage,
        arbExpiredDate,
        (page, expiredDate) => {
          const exception: ApprovedException = {
            id: 'test-exc',
            targetOrPage: page,
            owner: 'owner',
            reason: 'reason',
            approvalReference: 'TICKET-1',
            expiryDate: expiredDate,
            publishBlocking: true,
          };

          // Expired exceptions must be invalid
          expect(isExceptionValid(exception, EXECUTION_TIME)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('isExceptionValid returns true for any exception with expiry at or after execution time', () => {
    fc.assert(
      fc.property(
        arbPage,
        arbValidDate,
        (page, validDate) => {
          const exception: ApprovedException = {
            id: 'test-exc',
            targetOrPage: page,
            owner: 'owner',
            reason: 'reason',
            approvalReference: 'TICKET-1',
            expiryDate: validDate,
            publishBlocking: true,
          };

          // Valid (non-expired) exceptions must be valid
          expect(isExceptionValid(exception, EXECUTION_TIME)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('findValidException returns null when only expired exceptions exist for a page/field', () => {
    fc.assert(
      fc.property(
        arbPage,
        arbRouteField,
        fc.array(arbExpiredDate, { minLength: 1, maxLength: 5 }),
        (page, field, expiredDates) => {
          const exceptions: ApprovedException[] = expiredDates.map((date, i) => ({
            id: `exc-${i}`,
            targetOrPage: page,
            field,
            owner: 'owner',
            reason: 'reason',
            approvalReference: 'TICKET-1',
            expiryDate: date,
            publishBlocking: true,
          }));

          // No expired exception should be found as valid
          const result = findValidException(page, field, exceptions, EXECUTION_TIME);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a field change covered only by expired exceptions produces a blocking failure', () => {
    fc.assert(
      fc.property(
        arbPage,
        arbRouteField,
        arbFieldValue,
        arbFieldValue,
        fc.array(arbExpiredDate, { minLength: 1, maxLength: 3 }),
        (page, changedField, baselineVal, currentVal, expiredDates) => {
          // Ensure the values actually differ
          fc.pre(baselineVal !== currentVal);

          // Build baseline and current records with one field differing
          const baseFields: Record<string, string> = {
            documentId: 'doc-1',
            emittedRoute: '/docs/route',
            sidebarCategory: 'Category',
            sidebarLabel: 'Label',
            sidebarOrder: '1',
          };

          const baseline: RouteRecord = {
            page,
            ...baseFields,
            [changedField]: baselineVal,
          } as RouteRecord;

          const current: RouteRecord = {
            page,
            ...baseFields,
            [changedField]: currentVal,
          } as RouteRecord;

          // Create only expired exceptions for this page/field
          const exceptions: ApprovedException[] = expiredDates.map((date, i) => ({
            id: `exc-${i}`,
            targetOrPage: page,
            field: changedField,
            owner: 'owner',
            reason: 'reason',
            approvalReference: 'TICKET-1',
            expiryDate: date,
            publishBlocking: true,
          }));

          const result = comparePageRoutes(baseline, current, exceptions, EXECUTION_TIME);

          // The overall result MUST be 'fail' because expired exceptions are absent
          expect(result.overallResult).toBe('fail');

          // The changed field must show no exception reference
          const fieldResult = result.comparisons.find((c) => c.field === changedField);
          expect(fieldResult).toBeDefined();
          expect(fieldResult!.matches).toBe(false);
          expect(fieldResult!.exceptionReference).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a field change covered by a valid (non-expired) exception does NOT produce a failure', () => {
    fc.assert(
      fc.property(
        arbPage,
        arbRouteField,
        arbFieldValue,
        arbFieldValue,
        arbValidDate,
        (page, changedField, baselineVal, currentVal, validDate) => {
          // Ensure the values actually differ
          fc.pre(baselineVal !== currentVal);

          const baseFields: Record<string, string> = {
            documentId: 'doc-1',
            emittedRoute: '/docs/route',
            sidebarCategory: 'Category',
            sidebarLabel: 'Label',
            sidebarOrder: '1',
          };

          const baseline: RouteRecord = {
            page,
            ...baseFields,
            [changedField]: baselineVal,
          } as RouteRecord;

          const current: RouteRecord = {
            page,
            ...baseFields,
            [changedField]: currentVal,
          } as RouteRecord;

          // Create a valid (non-expired) exception for this page/field
          const exceptions: ApprovedException[] = [{
            id: 'valid-exc',
            targetOrPage: page,
            field: changedField,
            owner: 'owner',
            reason: 'Approved change',
            approvalReference: 'TICKET-1',
            expiryDate: validDate,
            publishBlocking: true,
          }];

          const result = comparePageRoutes(baseline, current, exceptions, EXECUTION_TIME);

          // The overall result MUST be 'pass' because the valid exception covers it
          expect(result.overallResult).toBe('pass');

          // The changed field must reference the valid exception
          const fieldResult = result.comparisons.find((c) => c.field === changedField);
          expect(fieldResult).toBeDefined();
          expect(fieldResult!.matches).toBe(false);
          expect(fieldResult!.exceptionReference).toBe('valid-exc');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('mixed expired and valid exceptions: only valid ones apply', () => {
    fc.assert(
      fc.property(
        arbPage,
        arbRouteField,
        arbFieldValue,
        arbFieldValue,
        arbExpiredDate,
        arbValidDate,
        (page, changedField, baselineVal, currentVal, expiredDate, validDate) => {
          fc.pre(baselineVal !== currentVal);

          const baseFields: Record<string, string> = {
            documentId: 'doc-1',
            emittedRoute: '/docs/route',
            sidebarCategory: 'Category',
            sidebarLabel: 'Label',
            sidebarOrder: '1',
          };

          const baseline: RouteRecord = {
            page,
            ...baseFields,
            [changedField]: baselineVal,
          } as RouteRecord;

          const current: RouteRecord = {
            page,
            ...baseFields,
            [changedField]: currentVal,
          } as RouteRecord;

          // One expired and one valid exception for the same page/field
          const exceptions: ApprovedException[] = [
            {
              id: 'expired-exc',
              targetOrPage: page,
              field: changedField,
              owner: 'owner',
              reason: 'Old approval',
              approvalReference: 'TICKET-OLD',
              expiryDate: expiredDate,
              publishBlocking: true,
            },
            {
              id: 'valid-exc',
              targetOrPage: page,
              field: changedField,
              owner: 'owner',
              reason: 'Current approval',
              approvalReference: 'TICKET-NEW',
              expiryDate: validDate,
              publishBlocking: true,
            },
          ];

          const result = comparePageRoutes(baseline, current, exceptions, EXECUTION_TIME);

          // The valid exception should cover the change — result passes
          expect(result.overallResult).toBe('pass');

          // The field should reference the valid exception, not the expired one
          const fieldResult = result.comparisons.find((c) => c.field === changedField);
          expect(fieldResult).toBeDefined();
          expect(fieldResult!.exceptionReference).toBe('valid-exc');
        },
      ),
      { numRuns: 100 },
    );
  });
});
