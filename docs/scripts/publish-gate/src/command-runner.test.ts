/**
 * Unit tests for the Command Runner module.
 *
 * Tests the output parsing logic and command orchestration using
 * injectable mock executors (no real commands are executed).
 */

import { describe, it, expect } from 'vitest';
import {
  parseCommandOutput,
  extractPageFromOutput,
  extractFailedAssertion,
  runValidationCommands,
  getCommandSpecs,
  type CommandExecutor,
} from './command-runner.js';

describe('extractPageFromOutput', () => {
  it('extracts .mdx file paths from output', () => {
    const stdout = 'Error in docs/get-started/overview.mdx: broken link found';
    expect(extractPageFromOutput(stdout, '')).toBe('get-started/overview.mdx');
  });

  it('extracts .md file paths from output', () => {
    const stderr = 'Warning: pages/tutorials/add-memory.md has issues';
    expect(extractPageFromOutput('', stderr)).toBe('tutorials/add-memory.md');
  });

  it('extracts git diff --check file:line patterns', () => {
    const stdout = 'src/utils.ts:42: trailing whitespace.';
    expect(extractPageFromOutput(stdout, '')).toBe('src/utils.ts');
  });

  it('returns null when no page is identifiable', () => {
    const stderr = 'npm ERR! code ELIFECYCLE\nnpm ERR! errno 1';
    expect(extractPageFromOutput('', stderr)).toBeNull();
  });

  it('extracts route-style page references', () => {
    const stdout = 'page: "/get-started/quickstart" has broken links';
    expect(extractPageFromOutput(stdout, '')).toBe('/get-started/quickstart');
  });
});

describe('extractFailedAssertion', () => {
  it('extracts error message from stderr', () => {
    const stderr = 'Error: Link https://example.com returned 404';
    const result = extractFailedAssertion('npm run validate:tutorial-links', 1, '', stderr);
    expect(result).toBe('Link https://example.com returned 404');
  });

  it('extracts FAILED pattern from output', () => {
    const stdout = 'FAILED: domain assertion for docs.aws.amazon.com';
    const result = extractFailedAssertion('npm run validate:tutorial-links', 1, stdout, '');
    expect(result).toBe('domain assertion for docs.aws.amazon.com');
  });

  it('falls back to command-derived assertion for validate:tutorial-links', () => {
    const result = extractFailedAssertion('npm run validate:tutorial-links', 1, '', '');
    expect(result).toBe('tutorial-link-validation-failed:exit-1');
  });

  it('falls back to command-derived assertion for validate', () => {
    const result = extractFailedAssertion('npm run validate', 1, '', '');
    expect(result).toBe('content-validation-failed:exit-1');
  });

  it('falls back to command-derived assertion for build', () => {
    const result = extractFailedAssertion('npm run build', 1, '', '');
    expect(result).toBe('build-failed:exit-1');
  });

  it('falls back to command-derived assertion for git diff', () => {
    const result = extractFailedAssertion('git diff --check', 1, '', '');
    expect(result).toBe('whitespace-or-conflict-marker-detected:exit-1');
  });

  it('truncates very long error messages', () => {
    const longError = 'Error: ' + 'a'.repeat(300);
    const result = extractFailedAssertion('npm run build', 1, '', longError);
    expect(result.length).toBeLessThanOrEqual(203); // 200 + '...'
  });
});

describe('parseCommandOutput', () => {
  it('produces a complete ValidationFailure with all required fields', () => {
    const result = parseCommandOutput(
      'npm run build',
      1,
      'Error in docs/get-started/overview.mdx: module not found',
      '',
      'Fix build errors'
    );

    expect(result.command).toBe('npm run build');
    expect(result.exitCode).toBe(1);
    expect(result.page).toBe('get-started/overview.mdx');
    expect(result.failedAssertion).toContain('module not found');
    expect(result.remediationPath).toBeTruthy();
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('uses default remediation when output has no fix suggestion', () => {
    const result = parseCommandOutput(
      'git diff --check',
      1,
      'README.md:10: trailing whitespace.',
      '',
      'Fix whitespace issues'
    );

    expect(result.remediationPath).toBe('Fix whitespace issues');
  });

  it('extracts remediation from output when available', () => {
    const result = parseCommandOutput(
      'npm run validate',
      1,
      '',
      'Content error found. To fix: remove duplicate heading on line 42',
      'Fix content validation errors'
    );

    expect(result.remediationPath).toContain('remove duplicate heading on line 42');
  });

  it('sets page to null when not identifiable', () => {
    const result = parseCommandOutput(
      'npm run validate',
      2,
      'Unknown error occurred',
      'npm ERR! code ELIFECYCLE',
      'Fix content validation errors'
    );

    expect(result.page).toBeNull();
  });

  it('preserves the actual exit code', () => {
    const result = parseCommandOutput('npm run build', 127, '', 'command not found', 'Fix build');
    expect(result.exitCode).toBe(127);
  });
});

describe('getCommandSpecs', () => {
  it('returns four command specifications', () => {
    const specs = getCommandSpecs('/path/to/docs', '/path/to/repo');
    expect(specs).toHaveLength(4);
  });

  it('sets correct working directories', () => {
    const specs = getCommandSpecs('/path/to/docs', '/path/to/repo');
    expect(specs[0].cwd).toBe('/path/to/docs');
    expect(specs[1].cwd).toBe('/path/to/docs');
    expect(specs[2].cwd).toBe('/path/to/docs');
    expect(specs[3].cwd).toBe('/path/to/repo');
  });

  it('contains the expected commands in order', () => {
    const specs = getCommandSpecs('/docs', '/repo');
    expect(specs[0].command).toBe('npm run validate:tutorial-links');
    expect(specs[1].command).toBe('npm run validate');
    expect(specs[2].command).toBe('npm run build');
    expect(specs[3].command).toBe('git diff --check');
  });
});

describe('runValidationCommands', () => {
  it('returns passed=true when all commands exit 0', () => {
    const mockExecutor: CommandExecutor = () => ({
      exitCode: 0,
      stdout: 'Success',
      stderr: '',
    });

    const result = runValidationCommands('/docs', '/repo', mockExecutor);
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('produces a failure record for non-zero exit', () => {
    const mockExecutor: CommandExecutor = (command: string) => {
      if (command === 'npm run build') {
        return { exitCode: 1, stdout: '', stderr: 'Error: Build failed' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const result = runValidationCommands('/docs', '/repo', mockExecutor);
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].command).toBe('npm run build');
    expect(result.failures[0].exitCode).toBe(1);
  });

  it('collects failures from multiple commands', () => {
    const mockExecutor: CommandExecutor = (command: string) => {
      if (command.includes('validate:tutorial-links')) {
        return { exitCode: 1, stdout: '', stderr: 'Error: Link 404' };
      }
      if (command.includes('git diff')) {
        return { exitCode: 1, stdout: 'file.md:1: trailing whitespace.', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const result = runValidationCommands('/docs', '/repo', mockExecutor);
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0].command).toBe('npm run validate:tutorial-links');
    expect(result.failures[1].command).toBe('git diff --check');
  });

  it('runs all four commands regardless of earlier failures', () => {
    const executedCommands: string[] = [];
    const mockExecutor: CommandExecutor = (command: string) => {
      executedCommands.push(command);
      return { exitCode: 1, stdout: '', stderr: 'Error: something' };
    };

    runValidationCommands('/docs', '/repo', mockExecutor);
    expect(executedCommands).toHaveLength(4);
    expect(executedCommands).toContain('npm run validate:tutorial-links');
    expect(executedCommands).toContain('npm run validate');
    expect(executedCommands).toContain('npm run build');
    expect(executedCommands).toContain('git diff --check');
  });

  it('passes correct working directory to executor', () => {
    const cwdLog: string[] = [];
    const mockExecutor: CommandExecutor = (_command: string, cwd: string) => {
      cwdLog.push(cwd);
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    runValidationCommands('/my/docs', '/my/repo', mockExecutor);
    expect(cwdLog[0]).toBe('/my/docs');
    expect(cwdLog[1]).toBe('/my/docs');
    expect(cwdLog[2]).toBe('/my/docs');
    expect(cwdLog[3]).toBe('/my/repo');
  });

  it('failure records contain valid ISO timestamps', () => {
    const mockExecutor: CommandExecutor = () => ({
      exitCode: 1,
      stdout: '',
      stderr: 'Error: fail',
    });

    const result = runValidationCommands('/docs', '/repo', mockExecutor);
    for (const failure of result.failures) {
      // Verify ISO-8601 format
      expect(new Date(failure.timestamp).toISOString()).toBe(failure.timestamp);
    }
  });

  it('failure records always have non-empty failedAssertion and remediationPath', () => {
    const mockExecutor: CommandExecutor = () => ({
      exitCode: 1,
      stdout: '',
      stderr: '',
    });

    const result = runValidationCommands('/docs', '/repo', mockExecutor);
    for (const failure of result.failures) {
      expect(failure.failedAssertion).toBeTruthy();
      expect(failure.failedAssertion.length).toBeGreaterThan(0);
      expect(failure.remediationPath).toBeTruthy();
      expect(failure.remediationPath.length).toBeGreaterThan(0);
    }
  });
});
