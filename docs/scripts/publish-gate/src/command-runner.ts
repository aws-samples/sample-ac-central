/**
 * Command Runner for the Publish Gate.
 *
 * Executes deterministic validation commands in sequence and produces
 * structured ValidationFailure records for any non-zero exits.
 *
 * Commands executed:
 * 1. `npm run validate:tutorial-links` (from docs/) — Req 2.1
 * 2. `npm run validate` (from docs/) — Req 3.1
 * 3. `npm run build` (from docs/) — Req 3.1
 * 4. `git diff --check` (from repo root) — Req 3.2
 */

import { execSync } from 'node:child_process';
import type { ValidationFailure } from './types.js';

/**
 * Defines a command to be executed by the runner.
 */
export interface CommandSpec {
  /** The command string to execute */
  command: string;
  /** Working directory for execution */
  cwd: string;
  /** Human-readable purpose of the command */
  purpose: string;
  /** Default remediation guidance when the command fails */
  defaultRemediation: string;
}

/**
 * Result of running all validation commands.
 */
export interface CommandRunnerResult {
  /** Whether all commands exited 0 */
  passed: boolean;
  /** Failure records for any non-zero exits */
  failures: ValidationFailure[];
}

/**
 * Function signature for command execution — injectable for testing.
 */
export type CommandExecutor = (
  command: string,
  cwd: string
) => { exitCode: number; stdout: string; stderr: string };

/**
 * The four validation commands in execution order.
 */
export function getCommandSpecs(docsDir: string, repoRoot: string): CommandSpec[] {
  return [
    {
      command: 'npm run validate:tutorial-links',
      cwd: docsDir,
      purpose: 'External link reachability, domain/topic assertions',
      defaultRemediation: 'Fix link targets or create Approved_Exception per failing URL',
    },
    {
      command: 'npm run validate',
      cwd: docsDir,
      purpose: 'Docusaurus content validation (includes broken-link enforcement)',
      defaultRemediation: 'Fix content validation errors reported in output',
    },
    {
      command: 'npm run build',
      cwd: docsDir,
      purpose: 'Full site build',
      defaultRemediation: 'Fix build errors reported in output',
    },
    {
      command: 'git diff --check',
      cwd: repoRoot,
      purpose: 'Whitespace and conflict-marker check',
      defaultRemediation: 'Fix whitespace issues or remove conflict markers from affected files',
    },
  ];
}

/**
 * Default command executor using child_process.execSync.
 * Captures stdout/stderr and exit code without throwing on non-zero exit.
 */
export const defaultExecutor: CommandExecutor = (command: string, cwd: string) => {
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000, // 5 minute timeout
    });
    return { exitCode: 0, stdout: stdout ?? '', stderr: '' };
  } catch (error: unknown) {
    const execError = error as {
      status?: number | null;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    return {
      exitCode: execError.status ?? 1,
      stdout: String(execError.stdout ?? ''),
      stderr: String(execError.stderr ?? ''),
    };
  }
};

/**
 * Parse command output to extract a page reference when identifiable.
 *
 * Looks for common patterns in validation/build output that reference
 * specific documentation pages.
 */
export function extractPageFromOutput(stdout: string, stderr: string): string | null {
  const combinedOutput = `${stdout}\n${stderr}`;

  // Pattern: file paths ending in .mdx or .md (common in Docusaurus output)
  const mdxMatch = combinedOutput.match(
    /(?:docs\/|site\/|pages\/)([^\s:]+\.(?:mdx|md))/i
  );
  if (mdxMatch) {
    return mdxMatch[1];
  }

  // Pattern: route-style paths from link validators (e.g., /get-started/overview)
  const routeMatch = combinedOutput.match(
    /(?:page|file|source):\s*['""]?([/\w-]+(?:\/[\w-]+)+)['""]?/i
  );
  if (routeMatch) {
    return routeMatch[1];
  }

  // Pattern: git diff --check output shows filename:line
  const gitDiffMatch = combinedOutput.match(/^([^\s:]+):(\d+):/m);
  if (gitDiffMatch) {
    return gitDiffMatch[1];
  }

  return null;
}

/**
 * Parse command output to derive a machine-readable failure assertion.
 *
 * Extracts meaningful error descriptions from command output, falling back
 * to a generic assertion based on the command name.
 */
export function extractFailedAssertion(
  command: string,
  exitCode: number,
  stdout: string,
  stderr: string
): string {
  const combinedOutput = `${stdout}\n${stderr}`;

  // Look for common error patterns
  const errorLineMatch = combinedOutput.match(
    /(?:error|Error|ERROR)[:\s]+(.+?)(?:\n|$)/
  );
  if (errorLineMatch) {
    // Truncate to a reasonable length for a machine-readable assertion
    const assertion = errorLineMatch[1].trim();
    return assertion.length > 200 ? assertion.slice(0, 200) + '...' : assertion;
  }

  // Look for "FAILED" or "FAIL" patterns
  const failMatch = combinedOutput.match(
    /(?:FAIL(?:ED)?|BROKEN)[:\s]+(.+?)(?:\n|$)/i
  );
  if (failMatch) {
    const assertion = failMatch[1].trim();
    return assertion.length > 200 ? assertion.slice(0, 200) + '...' : assertion;
  }

  // Fallback: derive from command name
  if (command.includes('validate:tutorial-links')) {
    return `tutorial-link-validation-failed:exit-${exitCode}`;
  }
  if (command.includes('validate')) {
    return `content-validation-failed:exit-${exitCode}`;
  }
  if (command.includes('build')) {
    return `build-failed:exit-${exitCode}`;
  }
  if (command.includes('git diff')) {
    return `whitespace-or-conflict-marker-detected:exit-${exitCode}`;
  }

  return `command-failed:exit-${exitCode}`;
}

/**
 * Parse command output into a structured ValidationFailure record.
 *
 * This is a pure function suitable for unit testing without executing commands.
 */
export function parseCommandOutput(
  command: string,
  exitCode: number,
  stdout: string,
  stderr: string,
  defaultRemediation: string
): ValidationFailure {
  const page = extractPageFromOutput(stdout, stderr);
  const failedAssertion = extractFailedAssertion(command, exitCode, stdout, stderr);

  // Try to extract more specific remediation from the output
  const remediationPath = deriveRemediation(stdout, stderr, defaultRemediation);

  return {
    command,
    exitCode,
    page,
    failedAssertion,
    remediationPath,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Derive remediation guidance from command output, falling back to default.
 */
function deriveRemediation(
  stdout: string,
  stderr: string,
  defaultRemediation: string
): string {
  const combinedOutput = `${stdout}\n${stderr}`;

  // Look for "fix" or "resolve" suggestions in output
  const fixMatch = combinedOutput.match(
    /(?:fix|resolve|to fix|solution)[:\s]+(.+?)(?:\n|$)/i
  );
  if (fixMatch) {
    const remediation = fixMatch[1].trim();
    return remediation.length > 300 ? remediation.slice(0, 300) + '...' : remediation;
  }

  return defaultRemediation;
}

/**
 * Run all validation commands in sequence and produce failure records.
 *
 * @param docsDir - Absolute path to the docs/ directory
 * @param repoRoot - Absolute path to the repository root
 * @param executor - Optional command executor (defaults to execSync-based)
 * @returns Result with pass/fail status and any failure records
 */
export function runValidationCommands(
  docsDir: string,
  repoRoot: string,
  executor: CommandExecutor = defaultExecutor
): CommandRunnerResult {
  const specs = getCommandSpecs(docsDir, repoRoot);
  const failures: ValidationFailure[] = [];

  for (const spec of specs) {
    const { exitCode, stdout, stderr } = executor(spec.command, spec.cwd);

    if (exitCode !== 0) {
      const failure = parseCommandOutput(
        spec.command,
        exitCode,
        stdout,
        stderr,
        spec.defaultRemediation
      );
      failures.push(failure);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
