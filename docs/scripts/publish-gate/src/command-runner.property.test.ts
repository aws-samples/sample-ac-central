/**
 * Property-based test: Failure report structure (Property 5)
 *
 * **Validates: Requirements 3.4**
 *
 * For any validation failure produced by the command runner, the failure
 * record SHALL contain a non-empty `failedAssertion` and `remediationPath`.
 * A failure record missing any of these fields SHALL itself be flagged as
 * malformed.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  parseCommandOutput,
  runValidationCommands,
  type CommandExecutor,
} from './command-runner.js';
import type { ValidationFailure } from './types.js';

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate one of the four validation commands. */
const arbCommand = fc.constantFrom(
  'npm run validate:tutorial-links',
  'npm run validate',
  'npm run build',
  'git diff --check',
);

/** Generate a non-zero exit code (1–127 typical range). */
const arbExitCode = fc.integer({ min: 1, max: 127 });

/**
 * Generate command output that may or may not include recognizable patterns.
 * This simulates various real-world outputs including empty strings,
 * generic errors, and structured messages.
 */
const arbOutputLine = fc.oneof(
  fc.constant(''),
  fc.constant('npm ERR! code ELIFECYCLE'),
  fc.constant('npm ERR! errno 1'),
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789 :/-_.'.split('')), {
    minLength: 0,
    maxLength: 100,
  }),
  fc.constant('Error: something went wrong'),
  fc.constant('FAILED: assertion check'),
  fc.constant('To fix: run npm install again'),
);

/** Generate stdout that may be empty or contain various patterns. */
const arbStdout = fc.array(arbOutputLine, { minLength: 0, maxLength: 5 }).map((lines) => lines.join('\n'));

/** Generate stderr that may be empty or contain various patterns. */
const arbStderr = fc.array(arbOutputLine, { minLength: 0, maxLength: 5 }).map((lines) => lines.join('\n'));

/** Generate a default remediation string (always non-empty per CommandSpec). */
const arbDefaultRemediation = fc.constantFrom(
  'Fix link targets or create Approved_Exception per failing URL',
  'Fix content validation errors reported in output',
  'Fix build errors reported in output',
  'Fix whitespace issues or remove conflict markers from affected files',
);

// ─── Malformed Record Detection ──────────────────────────────────────────────

/**
 * Checks whether a ValidationFailure record is well-formed.
 * A record is malformed if `failedAssertion` or `remediationPath` is missing or empty.
 */
function isMalformedFailure(failure: ValidationFailure): boolean {
  return (
    !failure.failedAssertion ||
    failure.failedAssertion.trim().length === 0 ||
    !failure.remediationPath ||
    failure.remediationPath.trim().length === 0
  );
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 5: Failure report structure', () => {
  it('parseCommandOutput always produces non-empty failedAssertion and remediationPath regardless of input', () => {
    fc.assert(
      fc.property(
        arbCommand,
        arbExitCode,
        arbStdout,
        arbStderr,
        arbDefaultRemediation,
        (command, exitCode, stdout, stderr, defaultRemediation) => {
          const failure = parseCommandOutput(command, exitCode, stdout, stderr, defaultRemediation);

          // Property: failedAssertion MUST be non-empty
          expect(failure.failedAssertion).toBeTruthy();
          expect(failure.failedAssertion.trim().length).toBeGreaterThan(0);

          // Property: remediationPath MUST be non-empty
          expect(failure.remediationPath).toBeTruthy();
          expect(failure.remediationPath.trim().length).toBeGreaterThan(0);

          // The record must not be flagged as malformed
          expect(isMalformedFailure(failure)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('parseCommandOutput always produces valid command, exitCode, and timestamp fields', () => {
    fc.assert(
      fc.property(
        arbCommand,
        arbExitCode,
        arbStdout,
        arbStderr,
        arbDefaultRemediation,
        (command, exitCode, stdout, stderr, defaultRemediation) => {
          const failure = parseCommandOutput(command, exitCode, stdout, stderr, defaultRemediation);

          // command must match what was passed in
          expect(failure.command).toBe(command);

          // exitCode must match what was passed in
          expect(failure.exitCode).toBe(exitCode);

          // timestamp must be valid ISO-8601
          expect(failure.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
          const parsedDate = new Date(failure.timestamp);
          expect(parsedDate.getTime()).not.toBeNaN();
        },
      ),
      { numRuns: 150 },
    );
  });

  it('runValidationCommands produces well-formed failure records for every non-zero exit', () => {
    fc.assert(
      fc.property(
        // Generate random exit codes for each of the 4 commands (0 = pass, >0 = fail)
        fc.tuple(
          fc.integer({ min: 0, max: 127 }),
          fc.integer({ min: 0, max: 127 }),
          fc.integer({ min: 0, max: 127 }),
          fc.integer({ min: 0, max: 127 }),
        ),
        fc.tuple(arbStdout, arbStdout, arbStdout, arbStdout),
        fc.tuple(arbStderr, arbStderr, arbStderr, arbStderr),
        (exitCodes, stdouts, stderrs) => {
          const commands = [
            'npm run validate:tutorial-links',
            'npm run validate',
            'npm run build',
            'git diff --check',
          ];

          let callIndex = 0;
          const mockExecutor: CommandExecutor = () => {
            const i = callIndex++;
            return {
              exitCode: exitCodes[i],
              stdout: stdouts[i],
              stderr: stderrs[i],
            };
          };

          const result = runValidationCommands('/docs', '/repo', mockExecutor);

          // Count how many commands had non-zero exit
          const expectedFailureCount = exitCodes.filter((code) => code !== 0).length;
          expect(result.failures.length).toBe(expectedFailureCount);

          // Property: every failure record must be well-formed
          for (const failure of result.failures) {
            // Non-empty failedAssertion
            expect(failure.failedAssertion).toBeTruthy();
            expect(failure.failedAssertion.trim().length).toBeGreaterThan(0);

            // Non-empty remediationPath
            expect(failure.remediationPath).toBeTruthy();
            expect(failure.remediationPath.trim().length).toBeGreaterThan(0);

            // Valid command name
            expect(commands).toContain(failure.command);

            // Non-zero exit code
            expect(failure.exitCode).toBeGreaterThan(0);

            // Valid timestamp
            expect(failure.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

            // The record must not be flagged as malformed
            expect(isMalformedFailure(failure)).toBe(false);
          }

          // passed should be true only when all exit codes are 0
          expect(result.passed).toBe(expectedFailureCount === 0);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('malformed failure records are correctly detected when fields are missing', () => {
    fc.assert(
      fc.property(
        arbCommand,
        arbExitCode,
        // Generate scenarios where failedAssertion or remediationPath might be empty
        fc.constantFrom('', ' ', '\t', '\n'),
        fc.constantFrom('', ' ', '\t', '\n'),
        fc.boolean(),
        (command, exitCode, emptyAssertion, emptyRemediation, clearAssertion) => {
          // Construct a malformed record manually to validate detection
          const malformed: ValidationFailure = {
            command,
            exitCode,
            page: null,
            failedAssertion: clearAssertion ? emptyAssertion : 'valid-assertion',
            remediationPath: clearAssertion ? 'valid-remediation' : emptyRemediation,
            timestamp: new Date().toISOString(),
          };

          // At least one field is empty/whitespace-only
          const shouldBeMalformed =
            (clearAssertion && emptyAssertion.trim().length === 0) ||
            (!clearAssertion && emptyRemediation.trim().length === 0);

          expect(isMalformedFailure(malformed)).toBe(shouldBeMalformed);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('completely empty stdout/stderr still produces well-formed failure records', () => {
    fc.assert(
      fc.property(arbCommand, arbExitCode, (command, exitCode) => {
        // Worst case: no output at all from the command
        const failure = parseCommandOutput(command, exitCode, '', '', 'Default fix action');

        expect(failure.failedAssertion).toBeTruthy();
        expect(failure.failedAssertion.trim().length).toBeGreaterThan(0);
        expect(failure.remediationPath).toBeTruthy();
        expect(failure.remediationPath.trim().length).toBeGreaterThan(0);
        expect(isMalformedFailure(failure)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
