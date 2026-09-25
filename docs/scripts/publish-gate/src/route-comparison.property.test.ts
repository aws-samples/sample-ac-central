/**
 * Property-based test: Route mutation detection (Property 1)
 *
 * **Validates: Requirements 1.2**
 *
 * For any Route_Baseline record and corresponding current route state,
 * if any of the five tracked fields differ and no valid (non-expired)
 * Approved_Exception covers the specific field change, then the route
 * comparison SHALL return a failure result for that page.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { comparePageRoutes, type RouteRecord } from './route-comparison.js';
import type { ApprovedException, RouteField } from './types.js';
import { ROUTE_COMPARISON_FIELDS } from './types.js';

// ─── Generators ──────────────────────────────────────────────────────────────

/** Fixed execution time for deterministic expiry comparisons. */
const EXECUTION_TIME = new Date('2024-06-15T00:00:00Z');

/** Generate a non-empty alphanumeric string suitable for route field values. */
const arbFieldValue = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-/'.split('')),
  { minLength: 1, maxLength: 30 },
);

/** Generate a page path. */
const arbPagePath = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-/'.split('')),
  { minLength: 3, maxLength: 40 },
);

/** Generate a complete RouteRecord with random field values. */
const arbRouteRecord: fc.Arbitrary<RouteRecord> = fc.record({
  page: arbPagePath,
  documentId: arbFieldValue,
  emittedRoute: arbFieldValue,
  sidebarCategory: arbFieldValue,
  sidebarLabel: arbFieldValue,
  sidebarOrder: arbFieldValue,
});

/**
 * Generate a mutated version of a baseline record.
 * Selects a non-empty subset of fields to mutate, ensuring mutated
 * values differ from the baseline.
 */
function arbMutatedRecord(baseline: RouteRecord): fc.Arbitrary<{ record: RouteRecord; mutatedFields: RouteField[] }> {
  // Generate a non-empty subset of fields to mutate
  return fc.subarray([...ROUTE_COMPARISON_FIELDS], { minLength: 1 }).chain((fieldsToMutate) => {
    // Generate new values for each mutated field, ensuring they differ
    const mutations = fieldsToMutate.map((field) =>
      arbFieldValue
        .filter((v) => v !== baseline[field])
        .map((v) => ({ field, value: v })),
    );

    return fc.tuple(...mutations).map((mutationPairs) => {
      const mutated: RouteRecord = { ...baseline };
      for (const { field, value } of mutationPairs) {
        mutated[field] = value;
      }
      return { record: mutated, mutatedFields: fieldsToMutate };
    });
  });
}

/** Exception expiry state: valid (future), expired (past), or missing (no exception). */
type ExceptionState = 'valid' | 'expired' | 'missing';

const arbExceptionState: fc.Arbitrary<ExceptionState> = fc.constantFrom('valid', 'expired', 'missing');

/**
 * Generate an exception for a specific page and field, with a given expiry state.
 */
function makeTestException(
  page: string,
  field: RouteField,
  state: ExceptionState,
): ApprovedException | null {
  if (state === 'missing') return null;

  return {
    id: `exc-${page}-${field}`,
    targetOrPage: page,
    field,
    owner: 'test-owner',
    reason: 'test reason',
    approvalReference: 'TICKET-TEST',
    expiryDate: state === 'valid' ? '2099-12-31' : '2020-01-01',
    publishBlocking: true,
  };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 1: Route mutation detection', () => {
  it('any unmatched field without a valid exception produces a failure result', () => {
    fc.assert(
      fc.property(
        arbRouteRecord.chain((baseline) =>
          arbMutatedRecord(baseline).chain((mutated) =>
            // Generate exception states for each mutated field
            fc
              .tuple(
                ...mutated.mutatedFields.map(() => arbExceptionState),
              )
              .map((exceptionStates) => ({
                baseline,
                current: mutated.record,
                mutatedFields: mutated.mutatedFields,
                exceptionStates,
              })),
          ),
        ),
        ({ baseline, current, mutatedFields, exceptionStates }) => {
          // Build the exception list based on generated states
          const exceptions: ApprovedException[] = [];
          const fieldExceptionMap = new Map<RouteField, ExceptionState>();

          mutatedFields.forEach((field, i) => {
            const state = exceptionStates[i];
            fieldExceptionMap.set(field, state);
            const exc = makeTestException(baseline.page, field, state);
            if (exc) exceptions.push(exc);
          });

          // Run route comparison
          const result = comparePageRoutes(baseline, current, exceptions, EXECUTION_TIME);

          // Determine if there is any mutated field NOT covered by a valid exception
          const hasUncoveredMutation = mutatedFields.some(
            (field) => fieldExceptionMap.get(field) !== 'valid',
          );

          if (hasUncoveredMutation) {
            // Property: if any field changed without a valid exception, result MUST be fail
            expect(result.overallResult).toBe('fail');
          } else {
            // All mutations covered by valid exceptions → result should pass
            expect(result.overallResult).toBe('pass');
          }

          // Additional check: each field comparison reflects the correct state
          for (const comparison of result.comparisons) {
            if (mutatedFields.includes(comparison.field)) {
              // Mutated field must NOT match
              expect(comparison.matches).toBe(false);

              const excState = fieldExceptionMap.get(comparison.field);
              if (excState === 'valid') {
                // Valid exception must be referenced
                expect(comparison.exceptionReference).not.toBeNull();
              } else {
                // Expired or missing exception must NOT be referenced
                expect(comparison.exceptionReference).toBeNull();
              }
            } else {
              // Non-mutated field must match
              expect(comparison.matches).toBe(true);
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('expired exceptions never cover a field change (strengthened from Property 1)', () => {
    fc.assert(
      fc.property(
        arbRouteRecord.chain((baseline) =>
          arbMutatedRecord(baseline).map((mutated) => ({
            baseline,
            current: mutated.record,
            mutatedFields: mutated.mutatedFields,
          })),
        ),
        ({ baseline, current, mutatedFields }) => {
          // All exceptions are expired for every mutated field
          const exceptions: ApprovedException[] = mutatedFields.map((field) => ({
            id: `exc-expired-${field}`,
            targetOrPage: baseline.page,
            field,
            owner: 'test-owner',
            reason: 'expired exception',
            approvalReference: 'TICKET-EXPIRED',
            expiryDate: '2020-01-01', // Well in the past relative to EXECUTION_TIME
            publishBlocking: true,
          }));

          const result = comparePageRoutes(baseline, current, exceptions, EXECUTION_TIME);

          // Property: expired exceptions never cover changes, so result must fail
          expect(result.overallResult).toBe('fail');

          // Every mutated field must show no exception reference
          for (const comparison of result.comparisons) {
            if (mutatedFields.includes(comparison.field)) {
              expect(comparison.exceptionReference).toBeNull();
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('identical records always pass regardless of exception state', () => {
    fc.assert(
      fc.property(
        arbRouteRecord,
        fc.array(arbExceptionState, { minLength: 0, maxLength: 5 }),
        (baseline, exceptionStates) => {
          // When baseline === current, no mutations exist, so result is always pass
          const exceptions: ApprovedException[] = exceptionStates.map((state, i) => ({
            id: `exc-no-op-${i}`,
            targetOrPage: baseline.page,
            field: ROUTE_COMPARISON_FIELDS[i % ROUTE_COMPARISON_FIELDS.length],
            owner: 'owner',
            reason: 'reason',
            approvalReference: 'TICKET',
            expiryDate: state === 'valid' ? '2099-12-31' : '2020-01-01',
            publishBlocking: true,
          }));

          const result = comparePageRoutes(baseline, baseline, exceptions, EXECUTION_TIME);

          expect(result.overallResult).toBe('pass');
          expect(result.comparisons.every((c) => c.matches)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
