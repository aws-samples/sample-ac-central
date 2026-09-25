/**
 * Route Comparison Engine
 *
 * Compares the immutable Unit 01 Route_Baseline against the current
 * Docusaurus-emitted routes/sidebar for each In_Scope_Page.
 *
 * For each page, compares five fields: documentId, emittedRoute,
 * sidebarCategory, sidebarLabel, sidebarOrder.
 *
 * Any difference without a valid (non-expired) Approved_Exception
 * is a blocking failure. Expired exceptions are treated as absent.
 */

import { readFile } from 'node:fs/promises';
import type {
  RouteComparisonResult,
  FieldComparison,
  ApprovedException,
  RouteField,
} from './types.js';
import { ROUTE_COMPARISON_FIELDS } from './types.js';

// ─── Baseline / Current Route Record ────────────────────────────────────────

/**
 * A route record representing a single page's tracked fields.
 * Both baseline and current routes use this shape.
 */
export interface RouteRecord {
  /** In_Scope_Page path (used as the lookup key) */
  page: string;
  documentId: string;
  emittedRoute: string;
  sidebarCategory: string;
  sidebarLabel: string;
  sidebarOrder: string;
}

// ─── Core Comparison Logic (pure, testable) ─────────────────────────────────

/**
 * Determines whether an exception is currently valid (not expired).
 *
 * @param exception - The exception to check
 * @param executionTime - The gate execution time to compare against (defaults to now)
 * @returns true if the exception has not expired
 */
export function isExceptionValid(
  exception: ApprovedException,
  executionTime: Date = new Date(),
): boolean {
  const expiryDate = new Date(exception.expiryDate);
  return expiryDate >= executionTime;
}

/**
 * Finds a valid (non-expired) exception covering a specific page and field.
 *
 * An exception matches if:
 * 1. Its `targetOrPage` equals the page path
 * 2. Its `field` matches the changed field (or is undefined, covering all fields)
 * 3. It has not expired relative to the execution time
 *
 * @param page - The page path to find an exception for
 * @param field - The field that changed
 * @param exceptions - All available exceptions
 * @param executionTime - Gate execution time for expiry check
 * @returns The matching exception ID, or null if none found
 */
export function findValidException(
  page: string,
  field: RouteField,
  exceptions: ApprovedException[],
  executionTime: Date = new Date(),
): string | null {
  const match = exceptions.find(
    (exc) =>
      exc.targetOrPage === page &&
      (exc.field === undefined || exc.field === field) &&
      isExceptionValid(exc, executionTime),
  );
  return match?.id ?? null;
}

/**
 * Compares baseline and current route records for a single page.
 *
 * @param baselinePage - The baseline record for the page
 * @param currentPage - The current record for the page
 * @param exceptions - All available exceptions
 * @param executionTime - Gate execution time for expiry check
 * @returns RouteComparisonResult with per-field comparisons and overall pass/fail
 */
export function comparePageRoutes(
  baselinePage: RouteRecord,
  currentPage: RouteRecord,
  exceptions: ApprovedException[],
  executionTime: Date = new Date(),
): RouteComparisonResult {
  const comparisons: FieldComparison[] = ROUTE_COMPARISON_FIELDS.map((field) => {
    const baselineValue = baselinePage[field];
    const currentValue = currentPage[field];
    const matches = baselineValue === currentValue;

    let exceptionReference: string | null = null;
    if (!matches) {
      exceptionReference = findValidException(
        baselinePage.page,
        field,
        exceptions,
        executionTime,
      );
    }

    return {
      field,
      baselineValue,
      currentValue,
      matches,
      exceptionReference,
    };
  });

  // A page fails if any field doesn't match AND isn't covered by a valid exception
  const hasUnexceptedFailure = comparisons.some(
    (c) => !c.matches && c.exceptionReference === null,
  );

  return {
    page: baselinePage.page,
    comparisons,
    overallResult: hasUnexceptedFailure ? 'fail' : 'pass',
  };
}

/**
 * Compares route records for all pages. This is the main entry point
 * for the route comparison engine's core logic.
 *
 * @param baselineRecords - All baseline route records
 * @param currentRecords - All current route records
 * @param exceptions - All available exceptions
 * @param executionTime - Gate execution time for expiry check (defaults to now)
 * @returns An array of RouteComparisonResult, one per baseline page
 */
export function compareRoutes(
  baselineRecords: RouteRecord[],
  currentRecords: RouteRecord[],
  exceptions: ApprovedException[],
  executionTime: Date = new Date(),
): RouteComparisonResult[] {
  // Index current records by page for efficient lookup
  const currentByPage = new Map<string, RouteRecord>();
  for (const record of currentRecords) {
    currentByPage.set(record.page, record);
  }

  return baselineRecords.map((baseline) => {
    const current = currentByPage.get(baseline.page);

    if (!current) {
      // Page is in baseline but missing from current routes — all fields fail
      const comparisons: FieldComparison[] = ROUTE_COMPARISON_FIELDS.map((field) => ({
        field,
        baselineValue: baseline[field],
        currentValue: '',
        matches: false,
        exceptionReference: findValidException(
          baseline.page,
          field,
          exceptions,
          executionTime,
        ),
      }));

      const hasUnexceptedFailure = comparisons.some(
        (c) => !c.matches && c.exceptionReference === null,
      );

      return {
        page: baseline.page,
        comparisons,
        overallResult: hasUnexceptedFailure ? 'fail' : 'pass',
      } satisfies RouteComparisonResult;
    }

    return comparePageRoutes(baseline, current, exceptions, executionTime);
  });
}

// ─── File-loading Wrapper ───────────────────────────────────────────────────

/**
 * Loads route comparison inputs from JSON files and runs the comparison.
 * This is a convenience wrapper for CLI/script usage.
 *
 * @param routeBaselinePath - Path to the Route_Baseline JSON file
 * @param currentRoutesPath - Path to the current Docusaurus-emitted routes JSON
 * @param exceptionsPath - Path to the Approved_Exception registry JSON
 * @param executionTime - Gate execution time for expiry check (defaults to now)
 * @returns Array of RouteComparisonResult
 */
export async function compareRoutesFromFiles(
  routeBaselinePath: string,
  currentRoutesPath: string,
  exceptionsPath: string,
  executionTime: Date = new Date(),
): Promise<RouteComparisonResult[]> {
  const [baselineRaw, currentRaw, exceptionsRaw] = await Promise.all([
    readFile(routeBaselinePath, 'utf-8'),
    readFile(currentRoutesPath, 'utf-8'),
    readFile(exceptionsPath, 'utf-8'),
  ]);

  const baselineRecords: RouteRecord[] = JSON.parse(baselineRaw);
  const currentRecords: RouteRecord[] = JSON.parse(currentRaw);
  const exceptions: ApprovedException[] = JSON.parse(exceptionsRaw);

  return compareRoutes(baselineRecords, currentRecords, exceptions, executionTime);
}
