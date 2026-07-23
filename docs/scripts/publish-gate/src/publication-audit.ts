/**
 * Publication_Audit Record Generation
 *
 * Assembles the full evidence chain for each In_Scope_Page and produces
 * a Publication_Audit record with status, owner, reason, verification date,
 * and publish decision.
 *
 * Key rule: A record with any missing evidence reference SHALL NOT receive
 * a `publish` decision — it must be `hold`.
 *
 * Requirements: 4.1, 4.4
 */

import type {
  PublicationAudit,
  ApprovedExceptionRef,
  RouteComparisonResult,
  PageStatus,
} from './types.js';
import type { AuditReconciliationFailure } from './audit-reconciliation.js';
import type { CommandRunnerResult } from './command-runner.js';

// ─── Input Interfaces ────────────────────────────────────────────────────────

/**
 * Evidence gathered from the Route Comparison stage for a single page.
 */
export interface RouteEvidenceForPage {
  /** Route_Baseline record reference ID */
  routeBaselineRef: string | null;
  /** Overall route comparison result for this page */
  result: 'pass' | 'fail';
}

/**
 * Evidence gathered from the Audit Reconciliation stage for a single page.
 */
export interface AuditEvidenceForPage {
  /** Canonical_Matrix record reference ID */
  canonicalMatrixRef: string | null;
  /** Retained_Code_Audit reference (null if no fenced blocks exist) */
  retainedCodeAuditRef: string | null;
  /** Whether fenced code blocks exist on this page */
  hasFencedBlocks: boolean;
  /** Any audit reconciliation failures for this page */
  failures: AuditReconciliationFailure[];
}

/**
 * Evidence gathered from the Command Runner stage.
 * These are global results (not per-page) since the commands
 * validate the entire site.
 */
export interface CommandEvidenceForPage {
  /** Link validator result for this page */
  linkValidatorResult: 'pass' | 'fail-excepted' | null;
  /** Content validation result for this page */
  contentValidationResult: 'pass' | 'fail-excepted' | null;
  /** Build result — must be 'pass' to reach semantic review */
  buildResult: 'pass' | null;
  /** Diff check result — must be 'pass' to reach semantic review */
  diffCheckResult: 'pass' | null;
}

/**
 * Content violations detected by the content scanning stage (task 7.1).
 */
export interface ContentViolation {
  /** Type of violation */
  type:
    | 'embedded-credential'
    | 'stale-navigation-label'
    | 'broken-local-link'
    | 'unrecorded-procedure'
    | 'unsupported-sandbox-claim'
    | 'missing-next-steps'
    | 'missing-prototype-boundary';
  /** Human-readable description */
  detail: string;
  /** Whether this violation can be covered by an exception */
  exceptionable: boolean;
}

/**
 * Complete evidence package for a single page, assembled from all prior stages.
 */
export interface PageEvidence {
  /** Route comparison evidence */
  route: RouteEvidenceForPage;
  /** Audit reconciliation evidence */
  audit: AuditEvidenceForPage;
  /** Command runner evidence */
  commands: CommandEvidenceForPage;
  /** Owner accountable for this page */
  owner: string;
  /** ISO-8601 verification date */
  verificationDate: string;
}

/**
 * Input for the batch audit generation function.
 */
export interface AllPagesEvidence {
  /** Map of page path → page evidence */
  pages: Map<string, PageEvidence>;
  /** Content violations per page (from semantic content scanning) */
  contentViolations: Map<string, ContentViolation[]>;
  /** Exceptions applicable to pages */
  exceptions: Map<string, ApprovedExceptionRef[]>;
}

// ─── Exception Record Validation ─────────────────────────────────────────────

/**
 * Required string fields on an ApprovedExceptionRef record.
 * A record missing any of these fields (null, undefined, or empty string)
 * SHALL be rejected.
 *
 * Requirement 2.3: EACH non-passing target or approved exception SHALL have
 * a Publication_Audit entry with: owner, reason, verification date, expiry date,
 * and publish-blocking decision.
 */
export const REQUIRED_EXCEPTION_FIELDS = [
  'exceptionId',
  'field',
  'owner',
  'reason',
  'approvalReference',
  'expiryDate',
] as const;

/**
 * Validates that an ApprovedExceptionRef record contains all required fields.
 *
 * A record is rejected (returns false) when:
 * - Any required string field is missing, null, undefined, or empty/whitespace-only
 * - The publishBlocking field is not a boolean
 *
 * @param record - The exception record to validate (may be partial/malformed)
 * @returns true if the record is complete and valid; false otherwise
 */
export function isValidExceptionRef(record: Partial<ApprovedExceptionRef> | Record<string, unknown>): boolean {
  // Check each required string field
  for (const field of REQUIRED_EXCEPTION_FIELDS) {
    const value = (record as Record<string, unknown>)[field];
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value !== 'string') {
      return false;
    }
    if (value.trim().length === 0) {
      return false;
    }
  }

  // publishBlocking must be a boolean
  const publishBlocking = (record as Record<string, unknown>).publishBlocking;
  if (publishBlocking === null || publishBlocking === undefined || typeof publishBlocking !== 'boolean') {
    return false;
  }

  return true;
}

/**
 * Validates all exception records attached to a Publication_Audit entry.
 * Returns true only if ALL exception records are complete and valid.
 *
 * @param exceptions - Array of ApprovedExceptionRef records to validate
 * @returns true if all records are valid; false if any are incomplete
 */
export function validateExceptionRecords(exceptions: Array<Partial<ApprovedExceptionRef> | Record<string, unknown>>): boolean {
  for (const exc of exceptions) {
    if (!isValidExceptionRef(exc)) {
      return false;
    }
  }
  return true;
}

// ─── Core Logic ─────────────────────────────────────────────────────────────

/**
 * Checks whether all evidence references in the evidence chain are present.
 * A missing reference means the record cannot receive a `publish` decision.
 *
 * @param evidence - The page evidence to check
 * @returns true if all required evidence is present
 */
export function isEvidenceComplete(evidence: PageEvidence): boolean {
  const { route, audit, commands } = evidence;

  // Route baseline ref must be present
  if (!route.routeBaselineRef) {
    return false;
  }

  // Canonical matrix ref must be present
  if (!audit.canonicalMatrixRef) {
    return false;
  }

  // Retained code audit ref must be present when the page has fenced blocks
  if (audit.hasFencedBlocks && !audit.retainedCodeAuditRef) {
    return false;
  }

  // All command results must be present
  if (!commands.linkValidatorResult) {
    return false;
  }
  if (!commands.contentValidationResult) {
    return false;
  }
  if (!commands.buildResult) {
    return false;
  }
  if (!commands.diffCheckResult) {
    return false;
  }

  return true;
}

/**
 * Determines the page status based on violations and whether they are
 * covered by exceptions.
 *
 * - `passed`: No violations, or all violations are excepted
 * - `needs-follow-up`: Non-blocking violations exist (all excepted but worth revisiting)
 * - `deferred`: Blocking violations that cannot be resolved now but are excepted
 *
 * @param violations - Content violations for the page
 * @param exceptions - Applicable exceptions for the page
 * @returns Status and reason tuple
 */
export function determineStatus(
  violations: ContentViolation[],
  exceptions: ApprovedExceptionRef[],
  auditFailures: AuditReconciliationFailure[],
): { status: PageStatus; reason: string } {
  // No violations and no audit failures → passed
  if (violations.length === 0 && auditFailures.length === 0) {
    return { status: 'passed', reason: 'All checks passed with no violations' };
  }

  // Check for non-exceptionable violations (always blocking)
  const nonExceptionable = violations.filter((v) => !v.exceptionable);
  if (nonExceptionable.length > 0) {
    return {
      status: 'needs-follow-up',
      reason: `Non-exceptionable violations detected: ${nonExceptionable.map((v) => v.type).join(', ')}`,
    };
  }

  // Check if all violations are covered by exceptions
  const hasExceptions = exceptions.length > 0;
  if (violations.length > 0 && hasExceptions) {
    // If all violations are exceptionable and we have exceptions → deferred
    return {
      status: 'deferred',
      reason: `Violations excepted: ${violations.map((v) => v.type).join(', ')}`,
    };
  }

  // Audit failures present
  if (auditFailures.length > 0) {
    return {
      status: 'needs-follow-up',
      reason: `Audit reconciliation issues: ${auditFailures.map((f) => f.checkType).join(', ')}`,
    };
  }

  // Remaining violations without exceptions
  return {
    status: 'needs-follow-up',
    reason: `Unresolved violations: ${violations.map((v) => v.type).join(', ')}`,
  };
}

/**
 * Determines the publish decision for a page.
 *
 * A page receives `publish` only when:
 * 1. All evidence references are complete (no missing refs)
 * 2. No blocking violations exist (non-exceptionable violations or unexcepted violations)
 * 3. Status is `passed`
 *
 * @param evidenceComplete - Whether all evidence references are present
 * @param status - The determined page status
 * @param violations - Content violations for the page
 * @param routeResult - Route comparison result for this page
 * @returns 'publish' or 'hold'
 */
export function determinePublishDecision(
  evidenceComplete: boolean,
  status: PageStatus,
  violations: ContentViolation[],
  routeResult: 'pass' | 'fail',
): 'publish' | 'hold' {
  // Rule: Missing evidence → always hold
  if (!evidenceComplete) {
    return 'hold';
  }

  // Route comparison must pass
  if (routeResult === 'fail') {
    return 'hold';
  }

  // Non-exceptionable violations → always hold
  if (violations.some((v) => !v.exceptionable)) {
    return 'hold';
  }

  // Only passed status gets publish
  if (status !== 'passed') {
    return 'hold';
  }

  return 'publish';
}

/**
 * Generates a single Publication_Audit record for a page.
 *
 * Assembles the full evidence chain, determines status based on violations
 * and exceptions, and enforces the "no publish if missing evidence" rule.
 *
 * @param page - The In_Scope_Page path
 * @param evidence - Complete evidence package for the page
 * @param exceptions - Applicable ApprovedExceptionRef entries
 * @param contentViolations - Content violations detected for this page
 * @returns A complete PublicationAudit record
 */
export function generatePublicationAudit(
  page: string,
  evidence: PageEvidence,
  exceptions: ApprovedExceptionRef[],
  contentViolations: ContentViolation[],
): PublicationAudit {
  const evidenceComplete = isEvidenceComplete(evidence);

  const { status, reason } = determineStatus(
    contentViolations,
    exceptions,
    evidence.audit.failures,
  );

  const publishDecision = determinePublishDecision(
    evidenceComplete,
    status,
    contentViolations,
    evidence.route.result,
  );

  return {
    page,
    status,
    owner: evidence.owner,
    reason,
    verificationDate: evidence.verificationDate,
    publishDecision,
    evidence: {
      routeBaselineRef: evidence.route.routeBaselineRef ?? '',
      canonicalMatrixRef: evidence.audit.canonicalMatrixRef ?? '',
      retainedCodeAuditRef: evidence.audit.retainedCodeAuditRef,
      linkValidatorResult: evidence.commands.linkValidatorResult ?? 'pass',
      contentValidationResult: evidence.commands.contentValidationResult ?? 'pass',
      buildResult: evidence.commands.buildResult ?? 'pass',
      diffCheckResult: evidence.commands.diffCheckResult ?? 'pass',
    },
    exceptions,
  };
}

/**
 * Generates Publication_Audit records for all pages in a batch.
 *
 * @param allEvidence - Evidence, violations, and exceptions for all pages
 * @returns Array of PublicationAudit records, one per page
 */
export function generateAllAudits(allEvidence: AllPagesEvidence): PublicationAudit[] {
  const audits: PublicationAudit[] = [];

  for (const [page, evidence] of allEvidence.pages) {
    const violations = allEvidence.contentViolations.get(page) ?? [];
    const exceptions = allEvidence.exceptions.get(page) ?? [];

    const audit = generatePublicationAudit(page, evidence, exceptions, violations);
    audits.push(audit);
  }

  return audits;
}

/**
 * Utility to create evidence from route comparison results, audit results,
 * and command runner results. This bridges the output of prior stages into
 * the format expected by generatePublicationAudit.
 *
 * @param page - The page path
 * @param routeResults - Route comparison results for all pages
 * @param auditFailures - Audit reconciliation failures for all pages
 * @param commandResult - Command runner result (global)
 * @param matrixRefMap - Map of page → canonical matrix record ID
 * @param routeBaselineRefMap - Map of page → route baseline record ID
 * @param retainedCodeRefMap - Map of page → retained code audit ref (null if no fences)
 * @param hasFencedBlocksMap - Map of page → whether page has fenced blocks
 * @param owner - Owner for the page
 * @param verificationDate - ISO-8601 verification date
 * @returns PageEvidence assembled from all sources
 */
export function assemblePageEvidence(
  page: string,
  routeResults: RouteComparisonResult[],
  auditFailures: AuditReconciliationFailure[],
  commandResult: CommandRunnerResult,
  matrixRefMap: Map<string, string>,
  routeBaselineRefMap: Map<string, string>,
  retainedCodeRefMap: Map<string, string | null>,
  hasFencedBlocksMap: Map<string, boolean>,
  owner: string,
  verificationDate: string,
): PageEvidence {
  // Route evidence
  const routeResult = routeResults.find((r) => r.page === page);
  const routeEvidence: RouteEvidenceForPage = {
    routeBaselineRef: routeBaselineRefMap.get(page) ?? null,
    result: routeResult?.overallResult ?? 'fail',
  };

  // Audit evidence
  const pageAuditFailures = auditFailures.filter((f) => f.page === page);
  const auditEvidence: AuditEvidenceForPage = {
    canonicalMatrixRef: matrixRefMap.get(page) ?? null,
    retainedCodeAuditRef: retainedCodeRefMap.get(page) ?? null,
    hasFencedBlocks: hasFencedBlocksMap.get(page) ?? false,
    failures: pageAuditFailures,
  };

  // Command evidence (global results apply to all pages)
  const linkFailed = commandResult.failures.some(
    (f) => f.command.includes('validate:tutorial-links'),
  );
  const contentFailed = commandResult.failures.some(
    (f) => f.command.includes('validate') && !f.command.includes('tutorial-links'),
  );
  const buildFailed = commandResult.failures.some((f) => f.command.includes('build'));
  const diffFailed = commandResult.failures.some((f) => f.command.includes('git diff'));

  const commandEvidence: CommandEvidenceForPage = {
    linkValidatorResult: commandResult.passed || !linkFailed ? 'pass' : 'fail-excepted',
    contentValidationResult: commandResult.passed || !contentFailed ? 'pass' : 'fail-excepted',
    buildResult: buildFailed ? null : 'pass',
    diffCheckResult: diffFailed ? null : 'pass',
  };

  return {
    route: routeEvidence,
    audit: auditEvidence,
    commands: commandEvidence,
    owner,
    verificationDate,
  };
}
