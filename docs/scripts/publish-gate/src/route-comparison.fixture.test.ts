/**
 * Fixture tests for the Route Comparison Engine (F01–F03).
 *
 * These are deterministic tests with specific known inputs and expected outputs,
 * validating Requirements 1.2: unapproved route/sidebar changes are detected.
 *
 * Validates: Requirements 1.2
 */

import { describe, it, expect } from 'vitest';
import { comparePageRoutes, type RouteRecord } from './route-comparison.js';
import type { ApprovedException } from './types.js';

// ─── Fixed execution time for deterministic expiry checks ────────────────────

const EXECUTION_TIME = new Date('2024-06-15T12:00:00Z');

// ─── Shared baseline record ─────────────────────────────────────────────────

const baselineRecord: RouteRecord = {
  page: 'tutorials/overview',
  documentId: 'tutorials-overview-001',
  emittedRoute: '/docs/tutorials/overview',
  sidebarCategory: 'Tutorials',
  sidebarLabel: 'Overview',
  sidebarOrder: '1',
};

// ─── F01: One field changed, no exception → fail ─────────────────────────────

describe('F01: One field changed, no exception → fail', () => {
  it('detects an unapproved sidebarLabel change and returns fail', () => {
    const currentRecord: RouteRecord = {
      ...baselineRecord,
      sidebarLabel: 'Tutorial Hub',
    };

    const result = comparePageRoutes(
      baselineRecord,
      currentRecord,
      [], // no exceptions
      EXECUTION_TIME,
    );

    expect(result.overallResult).toBe('fail');
    expect(result.page).toBe('tutorials/overview');

    // The sidebarLabel comparison should show the mismatch
    const labelComparison = result.comparisons.find((c) => c.field === 'sidebarLabel');
    expect(labelComparison).toBeDefined();
    expect(labelComparison!.matches).toBe(false);
    expect(labelComparison!.baselineValue).toBe('Overview');
    expect(labelComparison!.currentValue).toBe('Tutorial Hub');
    expect(labelComparison!.exceptionReference).toBeNull();

    // Other fields should still match
    const otherComparisons = result.comparisons.filter((c) => c.field !== 'sidebarLabel');
    expect(otherComparisons.every((c) => c.matches)).toBe(true);
  });
});

// ─── F02: Change covered by valid exception → pass ───────────────────────────

describe('F02: Change covered by valid exception → pass', () => {
  it('passes when a field change is covered by a non-expired exception', () => {
    const currentRecord: RouteRecord = {
      ...baselineRecord,
      emittedRoute: '/docs/tutorials/getting-started',
    };

    const validException: ApprovedException = {
      id: 'exc-route-tutorials-001',
      targetOrPage: 'tutorials/overview',
      field: 'emittedRoute',
      owner: 'docs-team',
      reason: 'Route restructured during tutorial consolidation',
      approvalReference: 'REVIEW-456',
      expiryDate: '2025-12-31', // Well in the future relative to EXECUTION_TIME
      publishBlocking: true,
    };

    const result = comparePageRoutes(
      baselineRecord,
      currentRecord,
      [validException],
      EXECUTION_TIME,
    );

    expect(result.overallResult).toBe('pass');
    expect(result.page).toBe('tutorials/overview');

    // The emittedRoute comparison should show the mismatch but have an exception reference
    const routeComparison = result.comparisons.find((c) => c.field === 'emittedRoute');
    expect(routeComparison).toBeDefined();
    expect(routeComparison!.matches).toBe(false);
    expect(routeComparison!.baselineValue).toBe('/docs/tutorials/overview');
    expect(routeComparison!.currentValue).toBe('/docs/tutorials/getting-started');
    expect(routeComparison!.exceptionReference).toBe('exc-route-tutorials-001');
  });
});

// ─── F03: Change covered by expired exception → fail ─────────────────────────

describe('F03: Change covered by expired exception → fail', () => {
  it('fails when the only covering exception has expired', () => {
    const currentRecord: RouteRecord = {
      ...baselineRecord,
      sidebarOrder: '5',
    };

    const expiredException: ApprovedException = {
      id: 'exc-order-expired-001',
      targetOrPage: 'tutorials/overview',
      field: 'sidebarOrder',
      owner: 'docs-team',
      reason: 'Temporary reordering during migration',
      approvalReference: 'REVIEW-789',
      expiryDate: '2024-01-01', // Expired relative to EXECUTION_TIME (2024-06-15)
      publishBlocking: true,
    };

    const result = comparePageRoutes(
      baselineRecord,
      currentRecord,
      [expiredException],
      EXECUTION_TIME,
    );

    expect(result.overallResult).toBe('fail');
    expect(result.page).toBe('tutorials/overview');

    // The sidebarOrder comparison should show the mismatch with no valid exception
    const orderComparison = result.comparisons.find((c) => c.field === 'sidebarOrder');
    expect(orderComparison).toBeDefined();
    expect(orderComparison!.matches).toBe(false);
    expect(orderComparison!.baselineValue).toBe('1');
    expect(orderComparison!.currentValue).toBe('5');
    expect(orderComparison!.exceptionReference).toBeNull(); // Expired = treated as absent
  });
});
