/**
 * Shared data model interfaces and type definitions for the Publish Gate.
 *
 * These types define the core structures used across all four stages of
 * the publication gate pipeline: Route Comparison, Audit Reconciliation,
 * Command Validation, and Semantic Review.
 */

// ─── Enums / Union Types ─────────────────────────────────────────────────────

/**
 * Status assigned to each In_Scope_Page in its Publication_Audit record.
 */
export type PageStatus = 'passed' | 'needs-follow-up' | 'deferred';

/**
 * Check types produced by the Audit Reconciliation Engine when a page
 * fails a completeness or approval check.
 */
export type AuditCheckType =
  | 'matrix-missing'
  | 'matrix-incomplete'
  | 'fence-unrecorded'
  | 'fence-unapproved'
  | 'procedure-duplicate'
  | 'target-unverified';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Final evidence record produced by the Semantic Review stage for each
 * In_Scope_Page. Traces the page to all prior artifacts and carries the
 * publish/hold decision.
 */
export interface PublicationAudit {
  /** In_Scope_Page path */
  page: string;
  status: PageStatus;
  /** Accountable person or team */
  owner: string;
  /** Justification for status */
  reason: string;
  /** ISO-8601 timestamp */
  verificationDate: string;
  /** Final gate decision */
  publishDecision: 'publish' | 'hold';

  /** Evidence chain (traceability) */
  evidence: {
    /** Route_Baseline record ID */
    routeBaselineRef: string;
    /** Canonical_Matrix record ID */
    canonicalMatrixRef: string;
    /** Retained_Code_Audit ref (null if no fences) */
    retainedCodeAuditRef: string | null;
    linkValidatorResult: 'pass' | 'fail-excepted';
    contentValidationResult: 'pass' | 'fail-excepted';
    buildResult: 'pass';
    diffCheckResult: 'pass';
  };

  /** Exceptions applied to this page */
  exceptions: ApprovedExceptionRef[];
}

/**
 * Reference to an approved exception attached to a Publication_Audit record.
 */
export interface ApprovedExceptionRef {
  exceptionId: string;
  /** What the exception covers */
  field: string;
  owner: string;
  reason: string;
  /** Ticket or review link */
  approvalReference: string;
  /** ISO-8601 date */
  expiryDate: string;
  /** true by default */
  publishBlocking: boolean;
}

/**
 * Result of route/sidebar comparison for a single In_Scope_Page.
 */
export interface RouteComparisonResult {
  page: string;
  comparisons: FieldComparison[];
  overallResult: 'pass' | 'fail';
}

/**
 * Field-level comparison between Route_Baseline and current state.
 */
export interface FieldComparison {
  field: 'documentId' | 'emittedRoute' | 'sidebarCategory' | 'sidebarLabel' | 'sidebarOrder';
  baselineValue: string;
  currentValue: string;
  matches: boolean;
  /** Approved_Exception ID if covered, null otherwise */
  exceptionReference: string | null;
}

/**
 * Structured failure record produced by the Command Runner when a
 * validation command exits non-zero.
 */
export interface ValidationFailure {
  /** Which command failed */
  command: string;
  /** Non-zero exit code */
  exitCode: number;
  /** Affected page (when identifiable from output) */
  page: string | null;
  /** Machine-readable failure code */
  failedAssertion: string;
  /** Human-readable action to fix */
  remediationPath: string;
  /** ISO-8601 */
  timestamp: string;
}

/**
 * Full Approved_Exception record stored in the exceptions registry.
 * Used by Route Comparison and Audit Reconciliation to determine
 * whether a failure can be excepted.
 */
export interface ApprovedException {
  /** Unique identifier */
  id: string;
  /** URL or In_Scope_Page path */
  targetOrPage: string;
  /** Specific field the exception covers (for route comparison matching) */
  field?: string;
  /** Accountable person or team */
  owner: string;
  /** Non-empty justification */
  reason: string;
  /** Ticket or review link */
  approvalReference: string;
  /** ISO-8601 date; expired = void */
  expiryDate: string;
  /** Defaults to true */
  publishBlocking: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * The 16 In_Scope_Pages — the exact inventory from the Canonical_Matrix.
 * These are the only pages the publish gate evaluates.
 */
export const IN_SCOPE_PAGES: readonly string[] = [
  'get-started/overview',
  'get-started/preflight',
  'get-started/quickstart',
  'get-started/firstagent',
  'get-started/existing-agent',
  'get-started/deployment-methods',
  'tutorials/overview',
  'tutorials/add-memory',
  'tutorials/connect-gateway-tool',
  'workloads/overview',
  'workloads/conversational/overview',
  'workloads/conversational/quickstart',
  'workloads/coding/overview',
  'workloads/coding/quickstart',
  'workloads/workflow/overview',
  'workloads/workflow/quickstart',
] as const;

/**
 * Type representing a valid In_Scope_Page path.
 */
export type InScopePage = (typeof IN_SCOPE_PAGES)[number];

/**
 * The five fields tracked by the Route Comparison Engine.
 */
export const ROUTE_COMPARISON_FIELDS = [
  'documentId',
  'emittedRoute',
  'sidebarCategory',
  'sidebarLabel',
  'sidebarOrder',
] as const;

/**
 * Type representing a trackable route/sidebar field.
 */
export type RouteField = (typeof ROUTE_COMPARISON_FIELDS)[number];
