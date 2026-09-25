/**
 * Gate Orchestrator — Four-Stage Pipeline
 *
 * Runs the publish gate stages in strict sequential order:
 * 1. Route Comparison — compare current state to Route_Baseline
 * 2. Audit Reconciliation — verify matrix + code audit completeness
 * 3. Command Validation — run validate, build, diff commands
 * 4. Semantic Review — generate Publication_Audit records
 *
 * A blocking failure at any stage halts execution — later stages do not run.
 * Produces the final publish/hold decision per page plus the complete
 * Publication_Audit set and overall gate decision.
 *
 * Requirements: 1.1, 2.2, 3.1, 4.1, 4.4
 */

import type {
  RouteComparisonResult,
  PublicationAudit,
  ApprovedException,
  ApprovedExceptionRef,
} from './types.js';
import { IN_SCOPE_PAGES } from './types.js';
import type { RouteRecord } from './route-comparison.js';
import { compareRoutes } from './route-comparison.js';
import type {
  MatrixRecord,
  RetainedCodeAuditRecord,
  CanonicalProcedure,
  AuditReconciliationFailure,
} from './audit-reconciliation.js';
import { reconcileAudits } from './audit-reconciliation.js';
import type { CommandRunnerResult, CommandExecutor } from './command-runner.js';
import { runValidationCommands } from './command-runner.js';
import type { ScanOptions } from './semantic-review.js';
import { scanPageContent } from './semantic-review.js';
import type { PageEvidence, AllPagesEvidence } from './publication-audit.js';
import { assemblePageEvidence, generateAllAudits } from './publication-audit.js';

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Configuration for the gate orchestrator.
 * Provides paths to all input files and working directories.
 */
export interface GateConfig {
  /** Route_Baseline records (already parsed or raw) */
  baselineRecords: RouteRecord[];
  /** Current emitted route records */
  currentRecords: RouteRecord[];
  /** Approved exceptions registry */
  exceptions: ApprovedException[];
  /** Canonical_Matrix records */
  matrixRecords: MatrixRecord[];
  /** Retained_Code_Audit records */
  retainedCodeRecords: RetainedCodeAuditRecord[];
  /** Canonical procedure definitions (for duplicate detection) */
  canonicalProcedures: CanonicalProcedure[];
  /** Absolute path to the docs/ directory */
  docsDir: string;
  /** Absolute path to the repository root */
  repoRoot: string;
  /** Map of page path → MDX content (for semantic review) */
  pageContents: Map<string, string>;
  /** Scan options per page (for semantic review) */
  scanOptions?: Map<string, ScanOptions>;
  /** Map of page → route baseline record ID */
  routeBaselineRefMap?: Map<string, string>;
  /** Map of page → canonical matrix record ID */
  matrixRefMap?: Map<string, string>;
  /** Map of page → retained code audit ref (null if no fences) */
  retainedCodeRefMap?: Map<string, string | null>;
  /** Map of page → whether page has fenced blocks */
  hasFencedBlocksMap?: Map<string, boolean>;
  /** Owner for all pages (default fallback) */
  defaultOwner?: string;
  /** Verification date (defaults to current ISO timestamp) */
  verificationDate?: string;
}

/**
 * Options for controlling gate execution behavior.
 */
export interface GateOptions {
  /** Gate execution time for expiry checks (defaults to now) */
  executionTime?: Date;
  /** Injectable command executor (for testing) */
  commandExecutor?: CommandExecutor;
  /** Pages to evaluate (defaults to IN_SCOPE_PAGES) */
  pages?: readonly string[];
}

// ─── Result Types ────────────────────────────────────────────────────────────

/**
 * Per-stage result indicating whether the stage passed.
 */
export interface StageResult {
  /** Human-readable stage name */
  stage: string;
  /** Whether the stage passed (no blocking failures) */
  passed: boolean;
  /** Reason for failure (when not passed) */
  reason?: string;
}

/**
 * Complete result produced by the gate orchestrator.
 */
export interface GateResult {
  /** Overall decision: publish if all stages pass, hold otherwise */
  overallDecision: 'publish' | 'hold';
  /** Stage number (1-4) where execution was blocked, or null if all passed */
  blockedAtStage: number | null;
  /** Route comparison results from Stage 1 */
  routeResults: RouteComparisonResult[];
  /** Audit reconciliation failures from Stage 2 */
  auditFailures: AuditReconciliationFailure[];
  /** Command runner result from Stage 3 */
  commandResult: CommandRunnerResult;
  /** Publication_Audit records from Stage 4 (empty if blocked before Stage 4) */
  audits: PublicationAudit[];
  /** Per-stage pass/fail summary */
  stageResults: StageResult[];
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Runs the four-stage publish gate pipeline in strict sequential order.
 *
 * Execution halts at the first stage with blocking failures. Later stages
 * do not run until all earlier failures are resolved or explicitly excepted.
 *
 * @param config - Gate configuration with all input data
 * @param options - Optional execution controls (time, executor, page list)
 * @returns Complete GateResult with all stage outputs and final decision
 */
export function runGate(config: GateConfig, options: GateOptions = {}): GateResult {
  const executionTime = options.executionTime ?? new Date();
  const pages = options.pages ?? IN_SCOPE_PAGES;
  const stageResults: StageResult[] = [];

  // Initialize empty defaults for stages that may not run
  let routeResults: RouteComparisonResult[] = [];
  let auditFailures: AuditReconciliationFailure[] = [];
  let commandResult: CommandRunnerResult = { passed: true, failures: [] };
  let audits: PublicationAudit[] = [];

  // ─── Stage 1: Route Comparison ─────────────────────────────────────────────

  routeResults = compareRoutes(
    config.baselineRecords,
    config.currentRecords,
    config.exceptions,
    executionTime,
  );

  const routeFailures = routeResults.filter((r) => r.overallResult === 'fail');
  const stage1Passed = routeFailures.length === 0;

  stageResults.push({
    stage: 'Route Comparison',
    passed: stage1Passed,
    reason: stage1Passed
      ? undefined
      : `${routeFailures.length} page(s) have unapproved route changes: ${routeFailures.map((r) => r.page).join(', ')}`,
  });

  if (!stage1Passed) {
    return {
      overallDecision: 'hold',
      blockedAtStage: 1,
      routeResults,
      auditFailures,
      commandResult,
      audits,
      stageResults,
    };
  }

  // ─── Stage 2: Audit Reconciliation ─────────────────────────────────────────

  auditFailures = reconcileAudits(
    config.matrixRecords,
    config.retainedCodeRecords,
    config.canonicalProcedures,
    pages,
  );

  const stage2Passed = auditFailures.length === 0;

  stageResults.push({
    stage: 'Audit Reconciliation',
    passed: stage2Passed,
    reason: stage2Passed
      ? undefined
      : `${auditFailures.length} audit failure(s): ${summarizeAuditFailures(auditFailures)}`,
  });

  if (!stage2Passed) {
    return {
      overallDecision: 'hold',
      blockedAtStage: 2,
      routeResults,
      auditFailures,
      commandResult,
      audits,
      stageResults,
    };
  }

  // ─── Stage 3: Command Validation ───────────────────────────────────────────

  const executor = options.commandExecutor;
  if (executor) {
    commandResult = runValidationCommands(config.docsDir, config.repoRoot, executor);
  } else {
    commandResult = runValidationCommands(config.docsDir, config.repoRoot);
  }

  const stage3Passed = commandResult.passed;

  stageResults.push({
    stage: 'Command Validation',
    passed: stage3Passed,
    reason: stage3Passed
      ? undefined
      : `${commandResult.failures.length} command(s) failed: ${commandResult.failures.map((f) => f.command).join(', ')}`,
  });

  if (!stage3Passed) {
    return {
      overallDecision: 'hold',
      blockedAtStage: 3,
      routeResults,
      auditFailures,
      commandResult,
      audits,
      stageResults,
    };
  }

  // ─── Stage 4: Semantic Review ──────────────────────────────────────────────

  const verificationDate = config.verificationDate ?? new Date().toISOString();
  const defaultOwner = config.defaultOwner ?? 'unassigned';

  // Run content scanning for each page
  const contentViolations = new Map<string, import('./publication-audit.js').ContentViolation[]>();
  for (const page of pages) {
    const content = config.pageContents.get(page) ?? '';
    const scanOpts = config.scanOptions?.get(page) ?? {};
    const violations = scanPageContent(page, content, scanOpts);

    // Convert from semantic-review ContentViolation to publication-audit ContentViolation
    const pubViolations: import('./publication-audit.js').ContentViolation[] = violations.map(
      (v) => ({
        type: v.violationType,
        detail: v.detail,
        exceptionable: v.violationType !== 'embedded-credential',
      }),
    );
    contentViolations.set(page, pubViolations);
  }

  // Assemble evidence and generate Publication_Audit records for all pages
  const pagesEvidence = new Map<string, PageEvidence>();
  const exceptionsMap = new Map<string, ApprovedExceptionRef[]>();

  for (const page of pages) {
    const evidence = assemblePageEvidence(
      page,
      routeResults,
      auditFailures,
      commandResult,
      config.matrixRefMap ?? new Map(),
      config.routeBaselineRefMap ?? new Map(),
      config.retainedCodeRefMap ?? new Map(),
      config.hasFencedBlocksMap ?? new Map(),
      defaultOwner,
      verificationDate,
    );
    pagesEvidence.set(page, evidence);

    // Convert approved exceptions to exception refs for this page
    const pageExceptions = config.exceptions
      .filter((e) => e.targetOrPage === page)
      .map(
        (e): ApprovedExceptionRef => ({
          exceptionId: e.id,
          field: e.field ?? '',
          owner: e.owner,
          reason: e.reason,
          approvalReference: e.approvalReference,
          expiryDate: e.expiryDate,
          publishBlocking: e.publishBlocking,
        }),
      );
    exceptionsMap.set(page, pageExceptions);
  }

  const allPagesEvidence: AllPagesEvidence = {
    pages: pagesEvidence,
    contentViolations,
    exceptions: exceptionsMap,
  };

  audits = generateAllAudits(allPagesEvidence);

  // Determine if semantic review produced any holds
  const holdPages = audits.filter((a) => a.publishDecision === 'hold');
  const stage4Passed = holdPages.length === 0;

  stageResults.push({
    stage: 'Semantic Review',
    passed: stage4Passed,
    reason: stage4Passed
      ? undefined
      : `${holdPages.length} page(s) held: ${holdPages.map((a) => a.page).join(', ')}`,
  });

  // Overall decision: publish only if ALL stages passed and all pages publish
  const overallDecision = stage4Passed ? 'publish' : 'hold';

  return {
    overallDecision,
    blockedAtStage: stage4Passed ? null : 4,
    routeResults,
    auditFailures,
    commandResult,
    audits,
    stageResults,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Summarize audit failures into a concise human-readable string.
 */
function summarizeAuditFailures(failures: AuditReconciliationFailure[]): string {
  const byType = new Map<string, number>();
  for (const f of failures) {
    byType.set(f.checkType, (byType.get(f.checkType) ?? 0) + 1);
  }
  return [...byType.entries()]
    .map(([type, count]) => `${type} (${count})`)
    .join(', ');
}
