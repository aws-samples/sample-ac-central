/**
 * Integration Tests for Full Gate Execution
 *
 * Tests the complete four-stage publish gate pipeline:
 * Route Comparison → Audit Reconciliation → Command Validation → Semantic Review
 *
 * These integration tests verify:
 * - All stages passing produces a publish decision
 * - Route failure blocks at stage 1 (later stages do not run)
 * - Audit failure blocks at stage 2 (later stages do not run)
 * - Command failure blocks at stage 3 (later stages do not run)
 *
 * Requirements: 1.1–1.4, 2.1–2.3, 3.1–3.4, 4.1–4.4
 */

import { describe, it, expect } from 'vitest';
import type { GateConfig, GateOptions } from './gate-orchestrator.js';
import { runGate } from './gate-orchestrator.js';
import type { RouteRecord } from './route-comparison.js';
import type {
  MatrixRecord,
  RetainedCodeAuditRecord,
  CanonicalProcedure,
} from './audit-reconciliation.js';
import type { CommandExecutor } from './command-runner.js';
import type { ApprovedException } from './types.js';

// ─── Test Fixture Helpers ────────────────────────────────────────────────────

/** The full 16-page inventory used in integration scenarios */
const INTEGRATION_PAGES = [
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
];

/**
 * Generates valid page content that passes semantic review:
 * - Contains a "Next steps" section with at least one valid Central link
 * - Includes the Prototype_Boundary link to operate/production-readiness
 * - No embedded credentials, stale labels, or broken links
 */
function validPageContent(page: string): string {
  const label = page.split('/').pop() ?? page;
  return `---
sidebar_label: ${label}
---

# ${label}

This page provides comprehensive guidance on ${label}.

## Overview

Content for the ${page} documentation page.

## Next steps

- [Continue to next topic](./next-page)
- [Production readiness](operate/production-readiness)
`;
}

/**
 * Builds a full GateConfig for the entire 16-page inventory where
 * all data is valid and consistent — every stage will pass when
 * paired with a passing command executor.
 */
function buildFullPassingConfig(): GateConfig {
  const baselineRecords: RouteRecord[] = INTEGRATION_PAGES.map((page, idx) => ({
    page,
    documentId: `doc-${page.replace(/\//g, '-')}`,
    emittedRoute: `/${page}`,
    sidebarCategory: page.split('/')[0],
    sidebarLabel: page.split('/').pop() ?? page,
    sidebarOrder: String(idx + 1),
  }));

  const currentRecords: RouteRecord[] = baselineRecords.map((r) => ({ ...r }));

  const matrixRecords: MatrixRecord[] = INTEGRATION_PAGES.map((page) => ({
    page,
    owner: 'team-docs',
    verificationTimestamp: '2024-06-01T10:00:00Z',
    targets: {
      defaultTarget: { verified: true },
      alternatives: [{ verified: true }, { verified: true }],
    },
  }));

  const retainedCodeRecords: RetainedCodeAuditRecord[] = [];
  const canonicalProcedures: CanonicalProcedure[] = [];
  const exceptions: ApprovedException[] = [];

  const pageContents = new Map<string, string>();
  for (const page of INTEGRATION_PAGES) {
    pageContents.set(page, validPageContent(page));
  }

  const routeBaselineRefMap = new Map<string, string>();
  const matrixRefMap = new Map<string, string>();
  const retainedCodeRefMap = new Map<string, string | null>();
  const hasFencedBlocksMap = new Map<string, boolean>();

  for (const page of INTEGRATION_PAGES) {
    routeBaselineRefMap.set(page, `rb-ref-${page.replace(/\//g, '-')}`);
    matrixRefMap.set(page, `mx-ref-${page.replace(/\//g, '-')}`);
    retainedCodeRefMap.set(page, null);
    hasFencedBlocksMap.set(page, false);
  }

  return {
    baselineRecords,
    currentRecords,
    exceptions,
    matrixRecords,
    retainedCodeRecords,
    canonicalProcedures,
    docsDir: '/tmp/integration-test/docs',
    repoRoot: '/tmp/integration-test',
    pageContents,
    routeBaselineRefMap,
    matrixRefMap,
    retainedCodeRefMap,
    hasFencedBlocksMap,
    defaultOwner: 'team-docs',
    verificationDate: '2024-06-01T12:00:00Z',
  };
}

/** Command executor where all commands succeed (exit 0) */
const allCommandsPass: CommandExecutor = () => ({
  exitCode: 0,
  stdout: 'All checks passed.',
  stderr: '',
});

/** Command executor where validate:tutorial-links fails */
const linkValidationFails: CommandExecutor = (command: string) => {
  if (command.includes('validate:tutorial-links')) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'Error: broken link detected at page: get-started/quickstart',
    };
  }
  return { exitCode: 0, stdout: 'OK', stderr: '' };
};

/** Command executor where npm run build fails */
const buildFails: CommandExecutor = (command: string) => {
  if (command.includes('build')) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: 'Error: Build failed - missing export in tutorials/add-memory',
    };
  }
  return { exitCode: 0, stdout: 'OK', stderr: '' };
};

/** Command executor where git diff --check fails */
const diffCheckFails: CommandExecutor = (command: string) => {
  if (command.includes('git diff')) {
    return {
      exitCode: 1,
      stdout: 'docs/get-started/overview.mdx:42: trailing whitespace.',
      stderr: '',
    };
  }
  return { exitCode: 0, stdout: 'OK', stderr: '' };
};

// ─── Integration Tests ───────────────────────────────────────────────────────

describe('Gate Orchestrator Integration: Full Pipeline Execution', () => {
  const executionTime = new Date('2024-06-01T12:00:00Z');

  describe('All stages passing → publish decision', () => {
    it('produces publish decision for all 16 pages when everything is valid', () => {
      const config = buildFullPassingConfig();
      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('publish');
      expect(result.blockedAtStage).toBeNull();
      expect(result.stageResults).toHaveLength(4);
      expect(result.stageResults[0].stage).toBe('Route Comparison');
      expect(result.stageResults[1].stage).toBe('Audit Reconciliation');
      expect(result.stageResults[2].stage).toBe('Command Validation');
      expect(result.stageResults[3].stage).toBe('Semantic Review');
      expect(result.stageResults.every((s) => s.passed)).toBe(true);
    });

    it('produces Publication_Audit records for every page', () => {
      const config = buildFullPassingConfig();
      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.audits).toHaveLength(INTEGRATION_PAGES.length);
      for (const audit of result.audits) {
        expect(audit.publishDecision).toBe('publish');
        expect(audit.status).toBe('passed');
        expect(audit.owner).toBe('team-docs');
        expect(audit.verificationDate).toBe('2024-06-01T12:00:00Z');
      }
    });

    it('each Publication_Audit has a complete evidence chain', () => {
      const config = buildFullPassingConfig();
      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      for (const audit of result.audits) {
        expect(audit.evidence.routeBaselineRef).toBeTruthy();
        expect(audit.evidence.canonicalMatrixRef).toBeTruthy();
        expect(audit.evidence.linkValidatorResult).toBe('pass');
        expect(audit.evidence.contentValidationResult).toBe('pass');
        expect(audit.evidence.buildResult).toBe('pass');
        expect(audit.evidence.diffCheckResult).toBe('pass');
      }
    });

    it('route comparison results cover all 16 pages', () => {
      const config = buildFullPassingConfig();
      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.routeResults).toHaveLength(INTEGRATION_PAGES.length);
      expect(result.routeResults.every((r) => r.overallResult === 'pass')).toBe(true);
    });
  });

  describe('Route failure → blocked at stage 1', () => {
    it('halts the pipeline when a page has an unapproved route change', () => {
      const config = buildFullPassingConfig();
      // Mutate a route field for one page to cause a stage 1 failure
      config.currentRecords[3].emittedRoute = '/renamed/firstagent-page';

      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(1);
      expect(result.stageResults).toHaveLength(1);
      expect(result.stageResults[0].stage).toBe('Route Comparison');
      expect(result.stageResults[0].passed).toBe(false);
    });

    it('does not execute audit reconciliation after route failure', () => {
      const config = buildFullPassingConfig();
      config.currentRecords[0].sidebarCategory = 'WRONG_CATEGORY';
      // Intentionally break audit data — if stage 2 ran, it would detect failures
      config.matrixRecords = [];

      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.blockedAtStage).toBe(1);
      expect(result.auditFailures).toHaveLength(0);
    });

    it('does not execute commands or semantic review after route failure', () => {
      const config = buildFullPassingConfig();
      config.currentRecords[5].documentId = 'tampered-doc-id';

      let commandsRan = false;
      const trackingExecutor: CommandExecutor = () => {
        commandsRan = true;
        return { exitCode: 0, stdout: '', stderr: '' };
      };

      const options: GateOptions = {
        commandExecutor: trackingExecutor,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.blockedAtStage).toBe(1);
      expect(commandsRan).toBe(false);
      expect(result.commandResult.failures).toHaveLength(0);
      expect(result.audits).toHaveLength(0);
    });

    it('identifies the specific page and field that failed', () => {
      const config = buildFullPassingConfig();
      // Change sidebarOrder for tutorials/add-memory (index 7)
      config.currentRecords[7].sidebarOrder = '99';

      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.blockedAtStage).toBe(1);
      const failedRoute = result.routeResults.find(
        (r) => r.overallResult === 'fail',
      );
      expect(failedRoute).toBeDefined();
      expect(failedRoute!.page).toBe('tutorials/add-memory');
      const failedField = failedRoute!.comparisons.find(
        (c) => !c.matches && c.exceptionReference === null,
      );
      expect(failedField).toBeDefined();
      expect(failedField!.field).toBe('sidebarOrder');
    });

    it('passes stage 1 when route change is covered by a valid exception', () => {
      const config = buildFullPassingConfig();
      config.currentRecords[2].sidebarLabel = 'Quick Start Guide';
      // Add a valid exception that covers this change
      config.exceptions.push({
        id: 'exc-route-001',
        targetOrPage: 'get-started/quickstart',
        field: 'sidebarLabel',
        owner: 'team-docs',
        reason: 'Intentional label rename for clarity',
        approvalReference: 'TICKET-789',
        expiryDate: '2025-12-31',
        publishBlocking: true,
      });

      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      // Stage 1 passes because the exception covers the change
      expect(result.stageResults[0].passed).toBe(true);
      expect(result.blockedAtStage).not.toBe(1);
    });

    it('blocks at stage 1 when exception is expired', () => {
      const config = buildFullPassingConfig();
      config.currentRecords[2].sidebarLabel = 'Quick Start Guide';
      // Add an expired exception
      config.exceptions.push({
        id: 'exc-route-expired',
        targetOrPage: 'get-started/quickstart',
        field: 'sidebarLabel',
        owner: 'team-docs',
        reason: 'Old rename exception',
        approvalReference: 'TICKET-100',
        expiryDate: '2024-01-01', // Expired before executionTime
        publishBlocking: true,
      });

      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(1);
    });
  });

  describe('Audit failure → blocked at stage 2', () => {
    it('halts the pipeline when a matrix record is missing', () => {
      const config = buildFullPassingConfig();
      // Remove matrix record for one page
      config.matrixRecords = config.matrixRecords.filter(
        (m) => m.page !== 'workloads/conversational/quickstart',
      );

      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(2);
      expect(result.stageResults).toHaveLength(2);
      expect(result.stageResults[0].passed).toBe(true); // Route passed
      expect(result.stageResults[1].passed).toBe(false); // Audit failed
      expect(result.auditFailures.length).toBeGreaterThan(0);
      expect(
        result.auditFailures.some((f) => f.checkType === 'matrix-missing'),
      ).toBe(true);
    });

    it('halts when a matrix record is incomplete (missing owner)', () => {
      const config = buildFullPassingConfig();
      // Set owner to null for one page's matrix record
      const targetRecord = config.matrixRecords.find(
        (m) => m.page === 'tutorials/overview',
      );
      if (targetRecord) {
        targetRecord.owner = null;
      }

      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(2);
      expect(
        result.auditFailures.some((f) => f.checkType === 'matrix-incomplete'),
      ).toBe(true);
    });

    it('halts when an alternative target is unverified', () => {
      const config = buildFullPassingConfig();
      // Set one alternative target as unverified
      const targetRecord = config.matrixRecords.find(
        (m) => m.page === 'workloads/coding/quickstart',
      );
      if (targetRecord) {
        targetRecord.targets.alternatives = [
          { verified: true },
          { verified: false },
        ];
      }

      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(2);
      expect(
        result.auditFailures.some((f) => f.checkType === 'target-unverified'),
      ).toBe(true);
    });

    it('does not execute commands when audit reconciliation fails', () => {
      const config = buildFullPassingConfig();
      config.matrixRecords = []; // Remove all matrix records

      let commandsRan = false;
      const trackingExecutor: CommandExecutor = () => {
        commandsRan = true;
        return { exitCode: 0, stdout: '', stderr: '' };
      };

      const options: GateOptions = {
        commandExecutor: trackingExecutor,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      runGate(config, options);

      expect(commandsRan).toBe(false);
    });

    it('does not produce Publication_Audit records when blocked at stage 2', () => {
      const config = buildFullPassingConfig();
      config.matrixRecords = [];

      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.blockedAtStage).toBe(2);
      expect(result.audits).toHaveLength(0);
    });
  });

  describe('Command failure → blocked at stage 3', () => {
    it('halts the pipeline when link validation command fails', () => {
      const config = buildFullPassingConfig();

      const options: GateOptions = {
        commandExecutor: linkValidationFails,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(3);
      expect(result.stageResults).toHaveLength(3);
      expect(result.stageResults[0].passed).toBe(true); // Route passed
      expect(result.stageResults[1].passed).toBe(true); // Audit passed
      expect(result.stageResults[2].passed).toBe(false); // Commands failed
      expect(result.commandResult.failures.length).toBeGreaterThan(0);
      expect(
        result.commandResult.failures[0].command,
      ).toContain('validate:tutorial-links');
    });

    it('halts when the build command fails', () => {
      const config = buildFullPassingConfig();

      const options: GateOptions = {
        commandExecutor: buildFails,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(3);
      expect(
        result.commandResult.failures.some((f) => f.command.includes('build')),
      ).toBe(true);
      expect(result.commandResult.failures[0].exitCode).toBe(2);
    });

    it('halts when git diff --check fails', () => {
      const config = buildFullPassingConfig();

      const options: GateOptions = {
        commandExecutor: diffCheckFails,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(3);
      expect(
        result.commandResult.failures.some((f) => f.command.includes('git diff')),
      ).toBe(true);
    });

    it('produces structured failure records with required fields', () => {
      const config = buildFullPassingConfig();

      const options: GateOptions = {
        commandExecutor: linkValidationFails,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      for (const failure of result.commandResult.failures) {
        expect(failure.command).toBeTruthy();
        expect(failure.exitCode).toBeGreaterThan(0);
        expect(failure.failedAssertion).toBeTruthy();
        expect(failure.remediationPath).toBeTruthy();
        expect(failure.timestamp).toBeTruthy();
      }
    });

    it('does not produce Publication_Audit records when blocked at stage 3', () => {
      const config = buildFullPassingConfig();

      const options: GateOptions = {
        commandExecutor: buildFails,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.blockedAtStage).toBe(3);
      expect(result.audits).toHaveLength(0);
    });

    it('confirms stages 1 and 2 passed before stage 3 blocks', () => {
      const config = buildFullPassingConfig();

      const options: GateOptions = {
        commandExecutor: diffCheckFails,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.stageResults[0].stage).toBe('Route Comparison');
      expect(result.stageResults[0].passed).toBe(true);
      expect(result.stageResults[1].stage).toBe('Audit Reconciliation');
      expect(result.stageResults[1].passed).toBe(true);
      expect(result.stageResults[2].stage).toBe('Command Validation');
      expect(result.stageResults[2].passed).toBe(false);
      // Route comparison results are still available
      expect(result.routeResults).toHaveLength(INTEGRATION_PAGES.length);
      // Audit failures are empty (stage 2 passed)
      expect(result.auditFailures).toHaveLength(0);
    });
  });

  describe('Semantic review failure → blocked at stage 4', () => {
    it('holds when a page contains embedded credentials', () => {
      const config = buildFullPassingConfig();
      // Inject a credential into one page
      config.pageContents.set(
        'get-started/firstagent',
        `---
sidebar_label: firstagent
---

# First Agent

Connect using AKIAIOSFODNN7EXAMPLE as the access key.

## Next steps

- [Continue](./next-page)
- [Production readiness](operate/production-readiness)
`,
      );

      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(4);
      expect(result.stageResults).toHaveLength(4);
      expect(result.stageResults[3].passed).toBe(false);
      // Still generates audit records (stage 4 ran)
      expect(result.audits.length).toBeGreaterThan(0);
      const held = result.audits.find(
        (a) => a.page === 'get-started/firstagent',
      );
      expect(held).toBeDefined();
      expect(held!.publishDecision).toBe('hold');
    });

    it('holds when a page is missing the Next steps section', () => {
      const config = buildFullPassingConfig();
      config.pageContents.set(
        'workloads/overview',
        `---
sidebar_label: overview
---

# Workloads Overview

Content without a Next steps section.
`,
      );

      const options: GateOptions = {
        commandExecutor: allCommandsPass,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(4);
      const held = result.audits.find((a) => a.page === 'workloads/overview');
      expect(held).toBeDefined();
      expect(held!.publishDecision).toBe('hold');
    });
  });

  describe('Pipeline ordering guarantee', () => {
    it('earlier stage failure prevents all later stages from executing', () => {
      const config = buildFullPassingConfig();
      // Break stage 1 (route)
      config.currentRecords[0].emittedRoute = '/broken-route';
      // Also break stage 2 (audit)
      config.matrixRecords = [];
      // Also break stage 3 (commands)
      const failExecutor: CommandExecutor = () => ({
        exitCode: 1,
        stdout: '',
        stderr: 'FAIL',
      });

      const options: GateOptions = {
        commandExecutor: failExecutor,
        pages: INTEGRATION_PAGES,
        executionTime,
      };

      const result = runGate(config, options);

      // Only stage 1 blocks — later stages never ran
      expect(result.blockedAtStage).toBe(1);
      expect(result.stageResults).toHaveLength(1);
      expect(result.auditFailures).toHaveLength(0);
      expect(result.commandResult.failures).toHaveLength(0);
      expect(result.audits).toHaveLength(0);
    });
  });
});
