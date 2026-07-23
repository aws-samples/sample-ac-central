/**
 * Gate Orchestrator Tests
 *
 * Verifies the four-stage pipeline executes in strict sequential order
 * and halts at any stage with blocking failures.
 */

import { describe, it, expect } from 'vitest';
import type { GateConfig, GateOptions } from './gate-orchestrator.js';
import { runGate } from './gate-orchestrator.js';
import type { RouteRecord } from './route-comparison.js';
import type { MatrixRecord, RetainedCodeAuditRecord, CanonicalProcedure } from './audit-reconciliation.js';
import type { CommandExecutor } from './command-runner.js';
import type { ApprovedException } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a minimal valid config where all stages pass.
 * All pages have matching routes, complete audit records, commands pass, and
 * page content includes required sections.
 */
function createPassingConfig(pages: string[] = ['get-started/overview']): GateConfig {
  const baselineRecords: RouteRecord[] = pages.map((page) => ({
    page,
    documentId: `doc-${page}`,
    emittedRoute: `/${page}`,
    sidebarCategory: 'Get Started',
    sidebarLabel: page.split('/').pop() ?? page,
    sidebarOrder: '1',
  }));

  const currentRecords: RouteRecord[] = baselineRecords.map((r) => ({ ...r }));

  const matrixRecords: MatrixRecord[] = pages.map((page) => ({
    page,
    owner: 'team-docs',
    verificationTimestamp: '2024-01-15T10:00:00Z',
    targets: {
      defaultTarget: { verified: true },
      alternatives: [],
    },
  }));

  const retainedCodeRecords: RetainedCodeAuditRecord[] = [];
  const canonicalProcedures: CanonicalProcedure[] = [];
  const exceptions: ApprovedException[] = [];

  // Minimal content that passes semantic review:
  // - Has a Next steps section with an internal link
  // - No credentials
  // - Has prototype boundary link (since pages may trigger it)
  const pageContents = new Map<string, string>();
  for (const page of pages) {
    pageContents.set(page, `---
sidebar_label: Overview
---

# Page content

Some documentation here.

## Next steps

- [Continue reading](./next-page)
- [Production readiness](operate/production-readiness)
`);
  }

  // Provide reference maps so evidence is complete
  const routeBaselineRefMap = new Map<string, string>();
  const matrixRefMap = new Map<string, string>();
  const retainedCodeRefMap = new Map<string, string | null>();
  const hasFencedBlocksMap = new Map<string, boolean>();
  for (const page of pages) {
    routeBaselineRefMap.set(page, `baseline-ref-${page}`);
    matrixRefMap.set(page, `matrix-ref-${page}`);
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
    docsDir: '/tmp/docs',
    repoRoot: '/tmp/repo',
    pageContents,
    routeBaselineRefMap,
    matrixRefMap,
    retainedCodeRefMap,
    hasFencedBlocksMap,
    defaultOwner: 'team-docs',
    verificationDate: '2024-01-15T12:00:00Z',
  };
}

/** A command executor that always succeeds (exit 0). */
const passingExecutor: CommandExecutor = () => ({
  exitCode: 0,
  stdout: 'OK',
  stderr: '',
});

/** A command executor that fails on the first command. */
const failingExecutor: CommandExecutor = (command: string) => {
  if (command.includes('validate:tutorial-links')) {
    return { exitCode: 1, stdout: '', stderr: 'Error: broken link detected' };
  }
  return { exitCode: 0, stdout: 'OK', stderr: '' };
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Gate Orchestrator', () => {
  describe('All stages passing', () => {
    it('returns publish decision when all stages pass', () => {
      const config = createPassingConfig();
      const options: GateOptions = {
        commandExecutor: passingExecutor,
        pages: ['get-started/overview'],
        executionTime: new Date('2024-01-15T12:00:00Z'),
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('publish');
      expect(result.blockedAtStage).toBeNull();
      expect(result.stageResults).toHaveLength(4);
      expect(result.stageResults.every((s) => s.passed)).toBe(true);
      expect(result.audits).toHaveLength(1);
      expect(result.audits[0].publishDecision).toBe('publish');
    });

    it('runs all four stages in order', () => {
      const config = createPassingConfig();
      const options: GateOptions = {
        commandExecutor: passingExecutor,
        pages: ['get-started/overview'],
        executionTime: new Date('2024-01-15T12:00:00Z'),
      };

      const result = runGate(config, options);

      expect(result.stageResults[0].stage).toBe('Route Comparison');
      expect(result.stageResults[1].stage).toBe('Audit Reconciliation');
      expect(result.stageResults[2].stage).toBe('Command Validation');
      expect(result.stageResults[3].stage).toBe('Semantic Review');
    });
  });

  describe('Stage 1: Route Comparison — halt on failure', () => {
    it('blocks at stage 1 when route comparison fails', () => {
      const config = createPassingConfig();
      // Mutate a field in the current routes to cause a mismatch
      config.currentRecords[0].sidebarLabel = 'CHANGED-LABEL';

      const options: GateOptions = {
        commandExecutor: passingExecutor,
        pages: ['get-started/overview'],
        executionTime: new Date('2024-01-15T12:00:00Z'),
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(1);
      expect(result.stageResults).toHaveLength(1);
      expect(result.stageResults[0].stage).toBe('Route Comparison');
      expect(result.stageResults[0].passed).toBe(false);
      // Later stages did not run
      expect(result.auditFailures).toHaveLength(0);
      expect(result.commandResult.failures).toHaveLength(0);
      expect(result.audits).toHaveLength(0);
    });

    it('does not run audit reconciliation when route comparison fails', () => {
      const config = createPassingConfig();
      config.currentRecords[0].emittedRoute = '/wrong-route';
      // Remove matrix records — if stage 2 ran, it would find failures
      config.matrixRecords = [];

      const options: GateOptions = {
        commandExecutor: passingExecutor,
        pages: ['get-started/overview'],
        executionTime: new Date('2024-01-15T12:00:00Z'),
      };

      const result = runGate(config, options);

      expect(result.blockedAtStage).toBe(1);
      // Stage 2 failures should be empty since it never ran
      expect(result.auditFailures).toHaveLength(0);
    });
  });

  describe('Stage 2: Audit Reconciliation — halt on failure', () => {
    it('blocks at stage 2 when matrix record is missing', () => {
      const config = createPassingConfig();
      // Remove matrix records to cause audit failure
      config.matrixRecords = [];

      const options: GateOptions = {
        commandExecutor: passingExecutor,
        pages: ['get-started/overview'],
        executionTime: new Date('2024-01-15T12:00:00Z'),
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(2);
      expect(result.stageResults).toHaveLength(2);
      expect(result.stageResults[0].passed).toBe(true); // Route passed
      expect(result.stageResults[1].passed).toBe(false); // Audit failed
      expect(result.auditFailures.length).toBeGreaterThan(0);
      // Stage 3 and 4 did not run
      expect(result.audits).toHaveLength(0);
    });

    it('blocks at stage 2 when matrix record is incomplete (missing owner)', () => {
      const config = createPassingConfig();
      config.matrixRecords[0].owner = null;

      const options: GateOptions = {
        commandExecutor: passingExecutor,
        pages: ['get-started/overview'],
        executionTime: new Date('2024-01-15T12:00:00Z'),
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(2);
      expect(result.auditFailures.some((f) => f.checkType === 'matrix-incomplete')).toBe(true);
    });

    it('does not run commands when audit reconciliation fails', () => {
      const config = createPassingConfig();
      config.matrixRecords = []; // Remove all matrix records

      let commandsExecuted = false;
      const trackingExecutor: CommandExecutor = () => {
        commandsExecuted = true;
        return { exitCode: 0, stdout: '', stderr: '' };
      };

      const options: GateOptions = {
        commandExecutor: trackingExecutor,
        pages: ['get-started/overview'],
        executionTime: new Date('2024-01-15T12:00:00Z'),
      };

      runGate(config, options);

      expect(commandsExecuted).toBe(false);
    });
  });

  describe('Stage 3: Command Validation — halt on failure', () => {
    it('blocks at stage 3 when a validation command fails', () => {
      const config = createPassingConfig();

      const options: GateOptions = {
        commandExecutor: failingExecutor,
        pages: ['get-started/overview'],
        executionTime: new Date('2024-01-15T12:00:00Z'),
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(3);
      expect(result.stageResults).toHaveLength(3);
      expect(result.stageResults[0].passed).toBe(true); // Route passed
      expect(result.stageResults[1].passed).toBe(true); // Audit passed
      expect(result.stageResults[2].passed).toBe(false); // Commands failed
      expect(result.commandResult.failures.length).toBeGreaterThan(0);
      // Stage 4 did not run
      expect(result.audits).toHaveLength(0);
    });

    it('includes specific command failures in result', () => {
      const config = createPassingConfig();

      const buildFailExecutor: CommandExecutor = (command: string) => {
        if (command.includes('build')) {
          return { exitCode: 2, stdout: '', stderr: 'Error: build failed' };
        }
        return { exitCode: 0, stdout: 'OK', stderr: '' };
      };

      const options: GateOptions = {
        commandExecutor: buildFailExecutor,
        pages: ['get-started/overview'],
        executionTime: new Date('2024-01-15T12:00:00Z'),
      };

      const result = runGate(config, options);

      expect(result.blockedAtStage).toBe(3);
      expect(result.commandResult.failures[0].command).toContain('build');
      expect(result.commandResult.failures[0].exitCode).toBe(2);
    });
  });

  describe('Stage 4: Semantic Review — hold decision', () => {
    it('holds at stage 4 when page content has violations', () => {
      const config = createPassingConfig();
      // Set page content that contains an embedded credential (always blocking)
      config.pageContents.set(
        'get-started/overview',
        `# Page

Some text with a credential: AKIAIOSFODNN7EXAMPLE

## Next steps

- [Continue](./next-page)
- [Production readiness](operate/production-readiness)
`,
      );

      const options: GateOptions = {
        commandExecutor: passingExecutor,
        pages: ['get-started/overview'],
        executionTime: new Date('2024-01-15T12:00:00Z'),
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(4);
      expect(result.stageResults).toHaveLength(4);
      expect(result.stageResults[3].passed).toBe(false);
      expect(result.audits).toHaveLength(1);
      expect(result.audits[0].publishDecision).toBe('hold');
    });

    it('holds when page is missing Next steps section', () => {
      const config = createPassingConfig();
      config.pageContents.set('get-started/overview', `# Simple page\n\nNo next steps here.\n`);

      const options: GateOptions = {
        commandExecutor: passingExecutor,
        pages: ['get-started/overview'],
        executionTime: new Date('2024-01-15T12:00:00Z'),
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(4);
      expect(result.audits[0].publishDecision).toBe('hold');
    });
  });

  describe('Multi-page handling', () => {
    it('evaluates all pages and one failure holds the overall decision', () => {
      const pages = ['get-started/overview', 'get-started/preflight'];
      const config = createPassingConfig(pages);
      // Make the second page have a route failure
      config.currentRecords[1].documentId = 'changed-doc-id';

      const options: GateOptions = {
        commandExecutor: passingExecutor,
        pages,
        executionTime: new Date('2024-01-15T12:00:00Z'),
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(1);
      expect(result.routeResults).toHaveLength(2);
      // First page passes, second fails
      expect(result.routeResults[0].overallResult).toBe('pass');
      expect(result.routeResults[1].overallResult).toBe('fail');
    });
  });

  describe('Exception handling', () => {
    it('passes stage 1 when route change is covered by valid exception', () => {
      const config = createPassingConfig();
      config.currentRecords[0].sidebarLabel = 'CHANGED-LABEL';
      // Add a valid exception covering this change
      config.exceptions.push({
        id: 'exc-001',
        targetOrPage: 'get-started/overview',
        field: 'sidebarLabel',
        owner: 'team-docs',
        reason: 'Intentional label rename',
        approvalReference: 'TICKET-123',
        expiryDate: '2025-12-31',
        publishBlocking: true,
      });

      const options: GateOptions = {
        commandExecutor: passingExecutor,
        pages: ['get-started/overview'],
        executionTime: new Date('2024-01-15T12:00:00Z'),
      };

      const result = runGate(config, options);

      // Should pass stage 1 because the exception covers the change
      expect(result.stageResults[0].passed).toBe(true);
      expect(result.blockedAtStage).not.toBe(1);
    });

    it('fails stage 1 when exception is expired', () => {
      const config = createPassingConfig();
      config.currentRecords[0].sidebarLabel = 'CHANGED-LABEL';
      // Add an expired exception
      config.exceptions.push({
        id: 'exc-002',
        targetOrPage: 'get-started/overview',
        field: 'sidebarLabel',
        owner: 'team-docs',
        reason: 'Old label rename',
        approvalReference: 'TICKET-456',
        expiryDate: '2023-01-01', // Expired
        publishBlocking: true,
      });

      const options: GateOptions = {
        commandExecutor: passingExecutor,
        pages: ['get-started/overview'],
        executionTime: new Date('2024-01-15T12:00:00Z'),
      };

      const result = runGate(config, options);

      expect(result.overallDecision).toBe('hold');
      expect(result.blockedAtStage).toBe(1);
    });
  });
});
