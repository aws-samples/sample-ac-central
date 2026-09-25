import { describe, it, expect } from 'vitest';
import {
  compareRoutes,
  comparePageRoutes,
  isExceptionValid,
  findValidException,
  type RouteRecord,
} from './route-comparison.js';
import type { ApprovedException } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRouteRecord(overrides: Partial<RouteRecord> = {}): RouteRecord {
  return {
    page: 'get-started/overview',
    documentId: 'doc-001',
    emittedRoute: '/docs/get-started/overview',
    sidebarCategory: 'Get Started',
    sidebarLabel: 'Overview',
    sidebarOrder: '1',
    ...overrides,
  };
}

function makeException(overrides: Partial<ApprovedException> = {}): ApprovedException {
  return {
    id: 'exc-001',
    targetOrPage: 'get-started/overview',
    field: 'emittedRoute',
    owner: 'team-docs',
    reason: 'Approved route change for restructuring',
    approvalReference: 'TICKET-123',
    expiryDate: '2099-12-31',
    publishBlocking: true,
    ...overrides,
  };
}

const FIXED_TIME = new Date('2024-06-15T00:00:00Z');

// ─── isExceptionValid ────────────────────────────────────────────────────────

describe('isExceptionValid', () => {
  it('returns true for a future expiry date', () => {
    const exc = makeException({ expiryDate: '2099-01-01' });
    expect(isExceptionValid(exc, FIXED_TIME)).toBe(true);
  });

  it('returns false for a past expiry date', () => {
    const exc = makeException({ expiryDate: '2020-01-01' });
    expect(isExceptionValid(exc, FIXED_TIME)).toBe(false);
  });

  it('returns true when expiry date equals execution time', () => {
    const exc = makeException({ expiryDate: '2024-06-15' });
    expect(isExceptionValid(exc, FIXED_TIME)).toBe(true);
  });
});

// ─── findValidException ──────────────────────────────────────────────────────

describe('findValidException', () => {
  it('returns exception ID when page, field, and expiry match', () => {
    const exceptions = [makeException()];
    const result = findValidException(
      'get-started/overview',
      'emittedRoute',
      exceptions,
      FIXED_TIME,
    );
    expect(result).toBe('exc-001');
  });

  it('returns null when page does not match', () => {
    const exceptions = [makeException({ targetOrPage: 'other/page' })];
    const result = findValidException(
      'get-started/overview',
      'emittedRoute',
      exceptions,
      FIXED_TIME,
    );
    expect(result).toBeNull();
  });

  it('returns null when field does not match', () => {
    const exceptions = [makeException({ field: 'sidebarLabel' })];
    const result = findValidException(
      'get-started/overview',
      'emittedRoute',
      exceptions,
      FIXED_TIME,
    );
    expect(result).toBeNull();
  });

  it('returns null when exception is expired', () => {
    const exceptions = [makeException({ expiryDate: '2020-01-01' })];
    const result = findValidException(
      'get-started/overview',
      'emittedRoute',
      exceptions,
      FIXED_TIME,
    );
    expect(result).toBeNull();
  });

  it('matches when exception field is undefined (covers all fields)', () => {
    const exceptions = [makeException({ field: undefined })];
    const result = findValidException(
      'get-started/overview',
      'sidebarCategory',
      exceptions,
      FIXED_TIME,
    );
    expect(result).toBe('exc-001');
  });
});

// ─── comparePageRoutes ───────────────────────────────────────────────────────

describe('comparePageRoutes', () => {
  it('returns pass when all fields match', () => {
    const baseline = makeRouteRecord();
    const current = makeRouteRecord();
    const result = comparePageRoutes(baseline, current, [], FIXED_TIME);

    expect(result.overallResult).toBe('pass');
    expect(result.page).toBe('get-started/overview');
    expect(result.comparisons.every((c) => c.matches)).toBe(true);
  });

  it('returns fail when a field differs without exception', () => {
    const baseline = makeRouteRecord();
    const current = makeRouteRecord({ emittedRoute: '/docs/new-route' });
    const result = comparePageRoutes(baseline, current, [], FIXED_TIME);

    expect(result.overallResult).toBe('fail');
    const routeComp = result.comparisons.find((c) => c.field === 'emittedRoute');
    expect(routeComp?.matches).toBe(false);
    expect(routeComp?.exceptionReference).toBeNull();
  });

  it('returns pass when a field differs but has valid exception', () => {
    const baseline = makeRouteRecord();
    const current = makeRouteRecord({ emittedRoute: '/docs/new-route' });
    const exceptions = [makeException({ field: 'emittedRoute' })];
    const result = comparePageRoutes(baseline, current, exceptions, FIXED_TIME);

    expect(result.overallResult).toBe('pass');
    const routeComp = result.comparisons.find((c) => c.field === 'emittedRoute');
    expect(routeComp?.matches).toBe(false);
    expect(routeComp?.exceptionReference).toBe('exc-001');
  });

  it('returns fail when exception is expired', () => {
    const baseline = makeRouteRecord();
    const current = makeRouteRecord({ emittedRoute: '/docs/new-route' });
    const exceptions = [makeException({ field: 'emittedRoute', expiryDate: '2020-01-01' })];
    const result = comparePageRoutes(baseline, current, exceptions, FIXED_TIME);

    expect(result.overallResult).toBe('fail');
    const routeComp = result.comparisons.find((c) => c.field === 'emittedRoute');
    expect(routeComp?.exceptionReference).toBeNull();
  });

  it('compares all five tracked fields', () => {
    const baseline = makeRouteRecord();
    const current = makeRouteRecord();
    const result = comparePageRoutes(baseline, current, [], FIXED_TIME);

    expect(result.comparisons).toHaveLength(5);
    const fields = result.comparisons.map((c) => c.field);
    expect(fields).toEqual([
      'documentId',
      'emittedRoute',
      'sidebarCategory',
      'sidebarLabel',
      'sidebarOrder',
    ]);
  });
});

// ─── compareRoutes (multi-page) ──────────────────────────────────────────────

describe('compareRoutes', () => {
  it('returns results for all baseline pages', () => {
    const baseline = [
      makeRouteRecord({ page: 'get-started/overview' }),
      makeRouteRecord({ page: 'get-started/quickstart' }),
    ];
    const current = [
      makeRouteRecord({ page: 'get-started/overview' }),
      makeRouteRecord({ page: 'get-started/quickstart' }),
    ];
    const results = compareRoutes(baseline, current, [], FIXED_TIME);

    expect(results).toHaveLength(2);
    expect(results[0].page).toBe('get-started/overview');
    expect(results[1].page).toBe('get-started/quickstart');
  });

  it('marks page as fail when missing from current routes', () => {
    const baseline = [makeRouteRecord({ page: 'get-started/overview' })];
    const current: RouteRecord[] = [];
    const results = compareRoutes(baseline, current, [], FIXED_TIME);

    expect(results[0].overallResult).toBe('fail');
    expect(results[0].comparisons.every((c) => !c.matches)).toBe(true);
  });

  it('handles multiple pages with mixed results', () => {
    const baseline = [
      makeRouteRecord({ page: 'get-started/overview' }),
      makeRouteRecord({ page: 'tutorials/overview', emittedRoute: '/docs/tutorials/overview' }),
    ];
    const current = [
      makeRouteRecord({ page: 'get-started/overview', sidebarLabel: 'Changed!' }),
      makeRouteRecord({ page: 'tutorials/overview', emittedRoute: '/docs/tutorials/overview' }),
    ];
    const results = compareRoutes(baseline, current, [], FIXED_TIME);

    expect(results[0].overallResult).toBe('fail');
    expect(results[1].overallResult).toBe('pass');
  });

  it('uses exceptions to cover differences across pages', () => {
    const baseline = [
      makeRouteRecord({ page: 'get-started/overview' }),
    ];
    const current = [
      makeRouteRecord({ page: 'get-started/overview', documentId: 'new-doc-id' }),
    ];
    const exceptions = [
      makeException({ targetOrPage: 'get-started/overview', field: 'documentId' }),
    ];
    const results = compareRoutes(baseline, current, exceptions, FIXED_TIME);

    expect(results[0].overallResult).toBe('pass');
  });
});
