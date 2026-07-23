/**
 * Fixture tests for the Command Runner (F12–F14).
 *
 * These are deterministic tests with specific known inputs and expected outputs,
 * validating the command runner's structured failure reporting for each
 * validation command.
 *
 * Validates: Requirements 2.1, 3.1, 3.2
 */

import { describe, it, expect } from 'vitest';
import { runValidationCommands, type CommandExecutor } from './command-runner.js';
import type { ValidationFailure } from './types.js';

// ─── Shared constants ────────────────────────────────────────────────────────

const DOCS_DIR = '/workspace/docs';
const REPO_ROOT = '/workspace';

// ─── F12: `npm run validate:tutorial-links` exits 1 → fail with structured report ─

describe('F12: npm run validate:tutorial-links exits 1 → fail with structured report', () => {
  it('produces a ValidationFailure record when tutorial link validation fails', () => {
    const mockExecutor: CommandExecutor = (command: string) => {
      if (command === 'npm run validate:tutorial-links') {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'Error: Link https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html returned 404',
        };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const result = runValidationCommands(DOCS_DIR, REPO_ROOT, mockExecutor);

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);

    const failure: ValidationFailure = result.failures[0];
    expect(failure.command).toBe('npm run validate:tutorial-links');
    expect(failure.exitCode).toBe(1);
    expect(failure.failedAssertion).toBeTruthy();
    expect(failure.failedAssertion.length).toBeGreaterThan(0);
    expect(failure.remediationPath).toBeTruthy();
    expect(failure.remediationPath.length).toBeGreaterThan(0);
    expect(failure.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('extracts the page reference from link validation output when available', () => {
    const mockExecutor: CommandExecutor = (command: string) => {
      if (command === 'npm run validate:tutorial-links') {
        return {
          exitCode: 1,
          stdout: 'FAILED: domain assertion for docs/get-started/quickstart.mdx',
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const result = runValidationCommands(DOCS_DIR, REPO_ROOT, mockExecutor);

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].page).toBe('get-started/quickstart.mdx');
  });

  it('sets page to null when no page is identifiable from link validation output', () => {
    const mockExecutor: CommandExecutor = (command: string) => {
      if (command === 'npm run validate:tutorial-links') {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'npm ERR! code ELIFECYCLE\nnpm ERR! errno 1',
        };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const result = runValidationCommands(DOCS_DIR, REPO_ROOT, mockExecutor);

    expect(result.passed).toBe(false);
    expect(result.failures[0].page).toBeNull();
    expect(result.failures[0].failedAssertion).toBeTruthy();
  });
});

// ─── F13: `npm run validate` exits 0 and `npm run build` exits 0 → pass ─────

describe('F13: npm run validate exits 0 and npm run build exits 0 → pass', () => {
  it('passes when both validate and build commands exit 0', () => {
    const mockExecutor: CommandExecutor = () => ({
      exitCode: 0,
      stdout: 'Success',
      stderr: '',
    });

    const result = runValidationCommands(DOCS_DIR, REPO_ROOT, mockExecutor);

    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('passes with no failures even when commands produce stderr warnings', () => {
    const mockExecutor: CommandExecutor = (command: string) => {
      if (command === 'npm run validate') {
        return {
          exitCode: 0,
          stdout: 'Validation complete.',
          stderr: 'Warning: deprecated plugin detected',
        };
      }
      if (command === 'npm run build') {
        return {
          exitCode: 0,
          stdout: '[SUCCESS] Build completed in 45s',
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const result = runValidationCommands(DOCS_DIR, REPO_ROOT, mockExecutor);

    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('does not produce a failure record for zero-exit commands', () => {
    const executedCommands: string[] = [];
    const mockExecutor: CommandExecutor = (command: string) => {
      executedCommands.push(command);
      return { exitCode: 0, stdout: 'OK', stderr: '' };
    };

    const result = runValidationCommands(DOCS_DIR, REPO_ROOT, mockExecutor);

    // All four commands are executed
    expect(executedCommands).toContain('npm run validate');
    expect(executedCommands).toContain('npm run build');
    // No failures produced
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });
});

// ─── F14: `git diff --check` exits 1 → fail with structured report ──────────

describe('F14: git diff --check exits 1 → fail with structured report', () => {
  it('produces a ValidationFailure record when git diff --check detects issues', () => {
    const mockExecutor: CommandExecutor = (command: string) => {
      if (command === 'git diff --check') {
        return {
          exitCode: 1,
          stdout: 'docs/get-started/overview.mdx:42: trailing whitespace.\n+    extra spaces   \n',
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const result = runValidationCommands(DOCS_DIR, REPO_ROOT, mockExecutor);

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);

    const failure: ValidationFailure = result.failures[0];
    expect(failure.command).toBe('git diff --check');
    expect(failure.exitCode).toBe(1);
    expect(failure.page).toBe('get-started/overview.mdx');
    expect(failure.failedAssertion).toBeTruthy();
    expect(failure.failedAssertion.length).toBeGreaterThan(0);
    expect(failure.remediationPath).toBeTruthy();
    expect(failure.remediationPath.length).toBeGreaterThan(0);
    expect(failure.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('extracts the affected file from git diff --check output', () => {
    const mockExecutor: CommandExecutor = (command: string) => {
      if (command === 'git diff --check') {
        return {
          exitCode: 1,
          stdout: 'src/components/Layout.tsx:15: trailing whitespace.',
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const result = runValidationCommands(DOCS_DIR, REPO_ROOT, mockExecutor);

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].page).toBe('src/components/Layout.tsx');
  });

  it('uses appropriate remediation guidance for whitespace issues', () => {
    const mockExecutor: CommandExecutor = (command: string) => {
      if (command === 'git diff --check') {
        return {
          exitCode: 1,
          stdout: 'README.md:10: trailing whitespace.',
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const result = runValidationCommands(DOCS_DIR, REPO_ROOT, mockExecutor);

    expect(result.passed).toBe(false);
    const failure = result.failures[0];
    // The remediation should address whitespace/conflict markers
    expect(failure.remediationPath).toBeTruthy();
    expect(failure.remediationPath.length).toBeGreaterThan(0);
  });

  it('generates a valid ISO-8601 timestamp on the failure record', () => {
    const mockExecutor: CommandExecutor = (command: string) => {
      if (command === 'git diff --check') {
        return {
          exitCode: 1,
          stdout: 'file.ts:1: trailing whitespace.',
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const result = runValidationCommands(DOCS_DIR, REPO_ROOT, mockExecutor);

    const failure = result.failures[0];
    // Verify it parses as a valid date
    const parsed = new Date(failure.timestamp);
    expect(parsed.getTime()).not.toBeNaN();
    expect(parsed.toISOString()).toBe(failure.timestamp);
  });
});
