#!/usr/bin/env node

/**
 * validate-tutorial-links.mjs
 *
 * Deterministic audit validator for the Canonical Source Matrix.
 * Reads five structured audit artifacts and the 16 In_Scope_Pages,
 * then runs eight ordered processing stages.
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — schema/audit failures (stages 1–3); no network requests issued
 *   2 — link, label, HTTP, or exception failures (stages 4–7)
 *
 * Usage:
 *   node scripts/validate-tutorial-links.mjs \
 *     [--matrixPath path] [--retainedCodeAuditPath path] \
 *     [--routeBaselinePath path] [--externalLinkInventoryPath path] \
 *     [--exceptionPath path] [--mdxPageGlob pattern]
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key.startsWith('--') && i + 1 < argv.length) {
      args[key.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

const cliArgs = parseArgs(process.argv);

const DEFAULTS = {
  matrixPath: 'audit/canonical-matrix.json',
  retainedCodeAuditPath: 'audit/retained-code-audit.json',
  routeBaselinePath: 'audit/route-baseline.json',
  externalLinkInventoryPath: 'audit/external-link-inventory.json',
  exceptionPath: 'audit/exceptions.json',
  mdxPageGlob: 'docs/{tutorials,get-started,workloads}/**/*.mdx',
};

const matrixPath = resolve(cliArgs.matrixPath || DEFAULTS.matrixPath);
const retainedCodeAuditPath = resolve(cliArgs.retainedCodeAuditPath || DEFAULTS.retainedCodeAuditPath);
const routeBaselinePath = resolve(cliArgs.routeBaselinePath || DEFAULTS.routeBaselinePath);
const externalLinkInventoryPath = resolve(cliArgs.externalLinkInventoryPath || DEFAULTS.externalLinkInventoryPath);
const exceptionPath = resolve(cliArgs.exceptionPath || DEFAULTS.exceptionPath);
const mdxPageGlob = cliArgs.mdxPageGlob || DEFAULTS.mdxPageGlob;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 10_000;

const IN_SCOPE_PAGES = [
  'tutorials/overview.mdx',
  'tutorials/add-memory.mdx',
  'tutorials/connect-gateway-tool.mdx',
  'get-started/overview.mdx',
  'get-started/preflight.mdx',
  'get-started/firstagent.mdx',
  'get-started/quickstart.mdx',
  'get-started/existing-agent.mdx',
  'get-started/deployment-methods.mdx',
  'workloads/conversational/overview.mdx',
  'workloads/conversational/quickstart.mdx',
  'workloads/conversational/harness-quickstart.mdx',
  'workloads/conversational/enterprise-features.mdx',
  'workloads/workflow/quickstart.mdx',
  'workloads/workflow/harness-quickstart.mdx',
  'workloads/coding/quickstart.mdx',
];

const VALID_DISPOSITIONS = [
  'central-only',
  'aws-doc-link-out',
  'cli-link-out',
  'sample-link-out',
  'hybrid-overview',
];

const VALID_RUNNABLE_CLASSIFICATIONS = ['runnable', 'non-runnable'];

const VALID_VERIFICATION_STATUSES = ['verified', 'unreachable', 'unapproved', 'pending'];

const VALID_CENTRAL_VALUE_CATEGORIES = [
  'workload fit',
  'architecture/trade-offs',
  'safety',
  'production readiness',
  'cost/resource awareness',
  'related Central links',
];

const GENERIC_LABELS = ['see the docs', 'official docs', 'learn more', 'click here'];

const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(\s*<?(https?:\/\/[^\s)>]+)>?\s*\)/g;
const HREF_RE = /\bhref\s*(?::|=)\s*["'](https?:\/\/[^"'\s]+)["']/g;
const AUTOLINK_RE = /<\s*(https?:\/\/[^>\s]+)\s*>/g;
const FENCE_RE = /^```(\w*)/gm;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadJson(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function normalizeLabel(text) {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

function findMdxFiles(globPattern) {
  // Manual glob implementation for the In_Scope_Pages
  const docsDir = resolve('docs');
  const files = [];
  for (const page of IN_SCOPE_PAGES) {
    const fullPath = join(docsDir, page);
    if (existsSync(fullPath)) {
      files.push({ page, fullPath });
    }
  }
  return files;
}

function countFencedBlocks(content) {
  const lines = content.split('\n');
  let count = 0;
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```')) {
      if (inFence) {
        inFence = false;
      } else {
        inFence = true;
        count += 1;
      }
    }
  }
  return count;
}

function extractExternalLinks(content) {
  const links = [];
  // Mask fenced code blocks to avoid extracting URLs from code
  const masked = content.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/[^\n]/g, ' ')
  );

  const patterns = [MARKDOWN_LINK_RE, HREF_RE, AUTOLINK_RE];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(masked)) !== null) {
      if (pattern === MARKDOWN_LINK_RE) {
        links.push({ label: match[1], url: match[2] });
      } else {
        links.push({ label: '', url: match[1] });
      }
    }
  }
  return links;
}

// ---------------------------------------------------------------------------
// Stage 1: Schema validation
// ---------------------------------------------------------------------------

function validateSchema(matrix, retainedAudit, routeBaseline, externalInventory, exceptions) {
  const errors = [];

  // Validate Canonical_Matrix
  const matrixPages = new Set(matrix.map((r) => r.page));
  const expectedPages = new Set(IN_SCOPE_PAGES);

  for (const page of expectedPages) {
    if (!matrixPages.has(page)) {
      errors.push(`Matrix missing required page: ${page}`);
    }
  }
  for (const page of matrixPages) {
    if (!expectedPages.has(page)) {
      errors.push(`Matrix contains extra page not in approved inventory: ${page}`);
    }
  }

  for (const record of matrix) {
    if (!record.page) {
      errors.push('Matrix record missing required field: page');
      continue;
    }
    if (!record.disposition || !VALID_DISPOSITIONS.includes(record.disposition)) {
      errors.push(`Matrix record "${record.page}": invalid disposition "${record.disposition}"`);
    }
    if (!record.defaultTarget) {
      errors.push(`Matrix record "${record.page}": missing defaultTarget`);
    } else {
      const t = record.defaultTarget;
      for (const field of ['url', 'expectedDomain', 'finalUrl', 'expectedTitleOrTopic', 'owner', 'reviewer', 'verificationTimestamp']) {
        if (!t[field]) {
          errors.push(`Matrix record "${record.page}": defaultTarget missing field "${field}"`);
        }
      }
      if (t.httpResult == null) {
        errors.push(`Matrix record "${record.page}": defaultTarget missing field "httpResult"`);
      }
      // Check verificationTimestamp freshness (7 days)
      if (t.verificationTimestamp) {
        const ts = new Date(t.verificationTimestamp);
        const now = new Date();
        const daysDiff = (now - ts) / (1000 * 60 * 60 * 24);
        if (daysDiff > 7) {
          errors.push(`Matrix record "${record.page}": verificationTimestamp is ${Math.floor(daysDiff)} days old (max 7)`);
        }
      }
    }

    // Validate alternatives
    if (record.alternatives && Array.isArray(record.alternatives)) {
      for (const alt of record.alternatives) {
        if (!alt.condition || alt.condition.trim() === '') {
          errors.push(`Matrix record "${record.page}": alternative entry missing non-empty condition`);
        }
      }
    }

    // Validate procedureAudit
    if (!record.procedureAudit || record.procedureAudit.noCanonicalProcedureRemains !== true) {
      errors.push(`Matrix record "${record.page}": procedureAudit.noCanonicalProcedureRemains must be true`);
    }

    // Validate centralValueCategories
    if (!record.centralValueCategories || !Array.isArray(record.centralValueCategories)) {
      errors.push(`Matrix record "${record.page}": missing centralValueCategories`);
    } else {
      for (const cat of record.centralValueCategories) {
        if (!VALID_CENTRAL_VALUE_CATEGORIES.includes(cat)) {
          errors.push(`Matrix record "${record.page}": invalid centralValueCategory "${cat}"`);
        }
      }
    }

    // Validate samplePath for sample-link-out
    if (record.disposition === 'sample-link-out') {
      if (!record.samplePath || !record.samplePath.expectedRepoPath || record.samplePath.pathExistenceVerified !== true) {
        errors.push(`Matrix record "${record.page}": sample-link-out requires samplePath with expectedRepoPath and pathExistenceVerified=true`);
      }
    }
  }

  // Validate Retained_Code_Audit records
  for (const record of retainedAudit) {
    if (!record.page) {
      errors.push('Retained_Code_Audit record missing required field: page');
      continue;
    }
    for (const field of ['headingAndOrdinal', 'language', 'purpose', 'centralOnlyRationale', 'canonicalSourceNotReplaced', 'reviewer']) {
      if (!record[field] || (typeof record[field] === 'string' && record[field].trim() === '')) {
        errors.push(`Retained_Code_Audit record "${record.page}" / "${record.headingAndOrdinal || '?'}": missing field "${field}"`);
      }
    }
    if (!record.runnableClassification || !VALID_RUNNABLE_CLASSIFICATIONS.includes(record.runnableClassification)) {
      errors.push(`Retained_Code_Audit record "${record.page}" / "${record.headingAndOrdinal || '?'}": invalid runnableClassification`);
    }
    if (record.approved == null) {
      errors.push(`Retained_Code_Audit record "${record.page}" / "${record.headingAndOrdinal || '?'}": missing approved field`);
    }
  }

  // Validate Route_Baseline records
  const baselineRecords = Array.isArray(routeBaseline) ? routeBaseline : (routeBaseline.records || []);
  for (const record of baselineRecords) {
    for (const field of ['documentId', 'emittedRoute', 'sidebarCategory', 'sidebarLabel', 'sourceFile', 'captureTimestamp']) {
      if (!record[field]) {
        errors.push(`Route_Baseline record "${record.documentId || '?'}": missing field "${field}"`);
      }
    }
    if (record.sidebarOrder == null) {
      errors.push(`Route_Baseline record "${record.documentId || '?'}": missing field "sidebarOrder"`);
    }
  }

  // Validate External_Link_Inventory records
  for (const record of externalInventory) {
    if (!record.page) {
      errors.push('External_Link_Inventory record missing required field: page');
      continue;
    }
    for (const field of ['url', 'normalizedLabel', 'auditRecord']) {
      if (!record[field] && record[field] !== '') {
        errors.push(`External_Link_Inventory record "${record.page}" / "${record.url || '?'}": missing field "${field}"`);
      }
    }
    if (!record.verificationStatus || !VALID_VERIFICATION_STATUSES.includes(record.verificationStatus)) {
      errors.push(`External_Link_Inventory record "${record.page}" / "${record.url || '?'}": invalid verificationStatus "${record.verificationStatus}"`);
    }
    // exceptionReference can be null but must be present
    if (!('exceptionReference' in record)) {
      errors.push(`External_Link_Inventory record "${record.page}" / "${record.url || '?'}": missing field "exceptionReference"`);
    }
  }

  // Validate Exception records
  for (const record of exceptions) {
    for (const field of ['targetOrPage', 'owner', 'reason', 'approvalReference', 'expiryDate']) {
      if (!record[field]) {
        errors.push(`Exception record "${record.targetOrPage || '?'}": missing field "${field}"`);
      }
    }
    // publishBlocking defaults to true if omitted — not a schema error
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Stage 2: MDX fence scan
// ---------------------------------------------------------------------------

function validateMdxFences(mdxFiles, retainedAudit) {
  const errors = [];

  for (const { page, fullPath } of mdxFiles) {
    const content = readFileSync(fullPath, 'utf8');
    const fenceCount = countFencedBlocks(content);

    // Find matching audit records for this page
    const pageRecords = retainedAudit.filter((r) => r.page === page);

    if (fenceCount === 0 && pageRecords.length === 0) continue;

    if (fenceCount > pageRecords.length) {
      errors.push(`Page "${page}": found ${fenceCount} fenced blocks but only ${pageRecords.length} audit records`);
    }

    // Check all records for this page are approved
    for (const record of pageRecords) {
      if (record.approved !== true) {
        errors.push(`Page "${page}": Retained_Code_Audit record "${record.headingAndOrdinal}" is not approved`);
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Stage 3: Procedure duplication check
// ---------------------------------------------------------------------------

function validateProcedureDuplication(matrix, retainedAudit) {
  const errors = [];

  // Collect all canonical procedure URLs from the matrix
  const canonicalUrls = new Set();
  for (const record of matrix) {
    if (record.defaultTarget && record.defaultTarget.url) {
      canonicalUrls.add(record.defaultTarget.url);
    }
    if (record.alternatives) {
      for (const alt of record.alternatives) {
        if (alt.target && alt.target.url) {
          canonicalUrls.add(alt.target.url);
        }
      }
    }
  }

  // Check retained code records: a runnable block that references the same
  // canonical source it claims not to replace, with no central-only rationale,
  // would be a duplication. We check if noCanonicalProcedureRemains is false.
  for (const record of retainedAudit) {
    if (record.runnableClassification === 'runnable' && record.canonicalSourceNotReplaced) {
      // If the canonical source URL is in the matrix AND the page's procedureAudit says
      // procedures remain, that's a duplication error
      const pageMatrix = matrix.find((m) => m.page === record.page);
      if (pageMatrix && pageMatrix.procedureAudit && !pageMatrix.procedureAudit.noCanonicalProcedureRemains) {
        errors.push(`Page "${record.page}": retained fence "${record.headingAndOrdinal}" duplicates a Canonical_Procedure`);
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Stage 4: External-link inventory check
// ---------------------------------------------------------------------------

function validateExternalLinkInventory(mdxFiles, externalInventory) {
  const violations = [];

  // Build lookup: key = `${page}|${url}`
  const inventoryLookup = new Map();
  for (const record of externalInventory) {
    const key = `${record.page}|${record.url}`;
    inventoryLookup.set(key, record);
  }

  for (const { page, fullPath } of mdxFiles) {
    const content = readFileSync(fullPath, 'utf8');
    const links = extractExternalLinks(content);

    for (const { url } of links) {
      const key = `${page}|${url}`;
      const invRecord = inventoryLookup.get(key);

      if (!invRecord) {
        violations.push({
          page,
          originalUrl: url,
          finalUrl: url,
          responseStatus: 0,
          expectedDomain: '',
          expectedTopic: '',
          failedAssertion: 'unrecorded-external-url',
        });
      } else if (invRecord.verificationStatus === 'unreachable') {
        violations.push({
          page,
          originalUrl: url,
          finalUrl: url,
          responseStatus: 0,
          expectedDomain: '',
          expectedTopic: '',
          failedAssertion: 'unreachable-external-url',
        });
      } else if (invRecord.verificationStatus === 'unapproved') {
        violations.push({
          page,
          originalUrl: url,
          finalUrl: url,
          responseStatus: 0,
          expectedDomain: '',
          expectedTopic: '',
          failedAssertion: 'unapproved-external-url',
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Stage 5: Generic-label check
// ---------------------------------------------------------------------------

function validateGenericLabels(mdxFiles, exceptions) {
  const violations = [];

  // Build exception lookup by targetOrPage (URL or page)
  const activeExceptions = exceptions.filter((e) => {
    if (e.expiryDate) {
      return new Date(e.expiryDate) > new Date();
    }
    return true;
  });
  const exceptionTargets = new Set(activeExceptions.map((e) => e.targetOrPage));

  for (const { page, fullPath } of mdxFiles) {
    const content = readFileSync(fullPath, 'utf8');
    const links = extractExternalLinks(content);

    for (const { label, url } of links) {
      const normalized = normalizeLabel(label);
      if (GENERIC_LABELS.includes(normalized)) {
        // Check for exception on this URL or page
        if (!exceptionTargets.has(url) && !exceptionTargets.has(page)) {
          violations.push({
            page,
            originalUrl: url,
            finalUrl: url,
            responseStatus: 0,
            expectedDomain: '',
            expectedTopic: '',
            failedAssertion: `generic-label: "${normalized}"`,
          });
        }
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Stage 6: Target HTTP checks
// ---------------------------------------------------------------------------

async function validateTargetHttp(matrix, exceptions) {
  const violations = [];

  // Build set of targets covered by non-expired, non-blocking exceptions
  const now = new Date();
  const exceptedTargets = new Set();
  for (const exc of exceptions) {
    if (exc.expiryDate && new Date(exc.expiryDate) <= now) continue;
    if (exc.publishBlocking === false) {
      exceptedTargets.add(exc.targetOrPage);
    }
  }

  for (const record of matrix) {
    const targets = [record.defaultTarget];
    if (record.alternatives) {
      for (const alt of record.alternatives) {
        if (alt.target) targets.push(alt.target);
      }
    }

    for (const target of targets) {
      if (!target || !target.url) continue;

      // Skip targets covered by a non-blocking exception
      if (exceptedTargets.has(target.url)) continue;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await fetch(target.url, {
          method: 'HEAD',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': 'AgentCoreCentralTutorialValidator/1.0',
            Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          },
        });
        clearTimeout(timeout);

        const status = response.status;
        const location = response.headers.get('location') || '';
        let finalUrl = target.url;
        let finalStatus = status;

        // Handle redirects manually to check domain approval
        if (status >= 300 && status < 400 && location) {
          const redirectUrl = new URL(location, target.url).href;
          const redirectDomain = new URL(redirectUrl).hostname;

          if (redirectDomain !== target.expectedDomain) {
            violations.push({
              page: record.page,
              originalUrl: target.url,
              finalUrl: redirectUrl,
              responseStatus: status,
              expectedDomain: target.expectedDomain,
              expectedTopic: target.expectedTitleOrTopic || '',
              failedAssertion: `unapproved-redirect: ${redirectDomain}`,
            });
            continue;
          }
          finalUrl = redirectUrl;
          // Follow the redirect to get final status
          try {
            const controller2 = new AbortController();
            const timeout2 = setTimeout(() => controller2.abort(), REQUEST_TIMEOUT_MS);
            const resp2 = await fetch(redirectUrl, {
              method: 'HEAD',
              redirect: 'follow',
              signal: controller2.signal,
              headers: {
                'User-Agent': 'AgentCoreCentralTutorialValidator/1.0',
                Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
              },
            });
            clearTimeout(timeout2);
            finalStatus = resp2.status;
            finalUrl = resp2.url || redirectUrl;
          } catch {
            finalStatus = 0;
          }
        }

        // Check domain match
        const actualDomain = new URL(finalUrl).hostname;
        if (actualDomain !== target.expectedDomain) {
          violations.push({
            page: record.page,
            originalUrl: target.url,
            finalUrl,
            responseStatus: finalStatus,
            expectedDomain: target.expectedDomain,
            expectedTopic: target.expectedTitleOrTopic || '',
            failedAssertion: `domain-mismatch: expected "${target.expectedDomain}", got "${actualDomain}"`,
          });
          continue;
        }

        // Check HTTP success
        if (finalStatus < 200 || finalStatus >= 400) {
          violations.push({
            page: record.page,
            originalUrl: target.url,
            finalUrl,
            responseStatus: finalStatus,
            expectedDomain: target.expectedDomain,
            expectedTopic: target.expectedTitleOrTopic || '',
            failedAssertion: `non-success-response: HTTP ${finalStatus}`,
          });
          continue;
        }

      } catch (err) {
        const errorMsg = err.name === 'AbortError'
          ? `timeout after ${REQUEST_TIMEOUT_MS}ms`
          : err.message;
        violations.push({
          page: record.page,
          originalUrl: target.url,
          finalUrl: target.url,
          responseStatus: 0,
          expectedDomain: target.expectedDomain || '',
          expectedTopic: target.expectedTitleOrTopic || '',
          failedAssertion: `request-failed: ${errorMsg}`,
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Stage 7: Exception enforcement
// ---------------------------------------------------------------------------

function validateExceptions(exceptions, externalInventory) {
  const violations = [];
  const now = new Date();

  for (const record of externalInventory) {
    if (record.exceptionReference) {
      // Find the exception record
      const exception = exceptions.find(
        (e) => e.targetOrPage === record.url || e.targetOrPage === record.page
      );

      if (!exception) {
        violations.push({
          page: record.page,
          originalUrl: record.url,
          finalUrl: record.url,
          responseStatus: 0,
          expectedDomain: '',
          expectedTopic: '',
          failedAssertion: 'exception-reference-not-found',
        });
        continue;
      }

      // Expired exceptions are treated as absent
      if (exception.expiryDate && new Date(exception.expiryDate) <= now) {
        violations.push({
          page: record.page,
          originalUrl: record.url,
          finalUrl: record.url,
          responseStatus: 0,
          expectedDomain: '',
          expectedTopic: '',
          failedAssertion: 'expired-exception',
        });
        continue;
      }

      // Omitted publishBlocking is treated as true (blocking)
      const isBlocking = exception.publishBlocking !== false;
      if (isBlocking && record.verificationStatus !== 'verified') {
        violations.push({
          page: record.page,
          originalUrl: record.url,
          finalUrl: record.url,
          responseStatus: 0,
          expectedDomain: '',
          expectedTopic: '',
          failedAssertion: 'publish-blocking-exception-unresolved',
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Stage 8: Stable report emission
// ---------------------------------------------------------------------------

function sortReport(violations) {
  return violations.sort((a, b) => {
    const pageCompare = a.page.localeCompare(b.page);
    if (pageCompare !== 0) return pageCompare;
    return (a.originalUrl || '').localeCompare(b.originalUrl || '');
  });
}

function emitReport(violations) {
  const sorted = sortReport(violations);
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Tutorial Links — Audit Validation Report                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (sorted.length === 0) {
    console.log('  ✓ All tutorial link audit checks passed.\n');
    return sorted;
  }

  console.log(`  ✗ ${sorted.length} violation(s) found:\n`);
  for (const record of sorted) {
    console.log(`  [FAIL] ${record.page}`);
    console.log(`         URL: ${record.originalUrl}`);
    if (record.finalUrl !== record.originalUrl) {
      console.log(`         Final URL: ${record.finalUrl}`);
    }
    if (record.responseStatus) {
      console.log(`         HTTP: ${record.responseStatus}`);
    }
    if (record.expectedDomain) {
      console.log(`         Expected domain: ${record.expectedDomain}`);
    }
    if (record.expectedTopic) {
      console.log(`         Expected topic: ${record.expectedTopic}`);
    }
    console.log(`         Assertion: ${record.failedAssertion}`);
    console.log('');
  }

  // Emit machine-readable JSON report to stdout
  console.log('── Machine-readable report ──────────────────────────────────────');
  console.log(JSON.stringify(sorted, null, 2));

  return sorted;
}

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------

async function main() {
  console.log('Loading audit artifacts...');

  let matrix, retainedAudit, routeBaseline, externalInventory, exceptions;

  try {
    matrix = loadJson(matrixPath);
    retainedAudit = loadJson(retainedCodeAuditPath);
    routeBaseline = loadJson(routeBaselinePath);
    externalInventory = loadJson(externalLinkInventoryPath);
    exceptions = loadJson(exceptionPath);
  } catch (err) {
    console.error(`  ✗ Failed to load audit artifacts: ${err.message}`);
    process.exit(1);
  }

  // Normalize routeBaseline — may be wrapped in an object with "records" key
  const baselineRecords = Array.isArray(routeBaseline) ? routeBaseline : (routeBaseline.records || []);

  console.log(`  Matrix records: ${matrix.length}`);
  console.log(`  Retained-code records: ${retainedAudit.length}`);
  console.log(`  Route-baseline records: ${baselineRecords.length}`);
  console.log(`  External-link inventory records: ${externalInventory.length}`);
  console.log(`  Exception records: ${exceptions.length}`);
  console.log('');

  // Find MDX files
  const mdxFiles = findMdxFiles(mdxPageGlob);
  console.log(`  In-scope MDX pages found: ${mdxFiles.length}/${IN_SCOPE_PAGES.length}`);
  console.log('');

  // ── Stage 1: Schema validation ──
  console.log('Stage 1: Schema validation...');
  const schemaErrors = validateSchema(matrix, retainedAudit, routeBaseline, externalInventory, exceptions);
  if (schemaErrors.length > 0) {
    console.error(`  ✗ Schema validation failed (${schemaErrors.length} error(s)):`);
    for (const err of schemaErrors) {
      console.error(`    - ${err}`);
    }
    process.exit(1);
  }
  console.log('  ✓ Schema validation passed.');

  // ── Stage 2: MDX fence scan ──
  console.log('Stage 2: MDX fence scan...');
  const fenceErrors = validateMdxFences(mdxFiles, retainedAudit);
  if (fenceErrors.length > 0) {
    console.error(`  ✗ MDX fence scan failed (${fenceErrors.length} error(s)):`);
    for (const err of fenceErrors) {
      console.error(`    - ${err}`);
    }
    process.exit(1);
  }
  console.log('  ✓ MDX fence scan passed.');

  // ── Stage 3: Procedure duplication check ──
  console.log('Stage 3: Procedure duplication check...');
  const dupErrors = validateProcedureDuplication(matrix, retainedAudit);
  if (dupErrors.length > 0) {
    console.error(`  ✗ Procedure duplication check failed (${dupErrors.length} error(s)):`);
    for (const err of dupErrors) {
      console.error(`    - ${err}`);
    }
    process.exit(1);
  }
  console.log('  ✓ Procedure duplication check passed.');

  // ── Stages 4–7: Collect all violations ──
  const allViolations = [];

  // ── Stage 4: External-link inventory check ──
  console.log('Stage 4: External-link inventory check...');
  const inventoryViolations = validateExternalLinkInventory(mdxFiles, externalInventory);
  allViolations.push(...inventoryViolations);
  if (inventoryViolations.length > 0) {
    console.log(`  ⚠ ${inventoryViolations.length} external-link inventory violation(s)`);
  } else {
    console.log('  ✓ External-link inventory check passed.');
  }

  // ── Stage 5: Generic-label check ──
  console.log('Stage 5: Generic-label check...');
  const labelViolations = validateGenericLabels(mdxFiles, exceptions);
  allViolations.push(...labelViolations);
  if (labelViolations.length > 0) {
    console.log(`  ⚠ ${labelViolations.length} generic-label violation(s)`);
  } else {
    console.log('  ✓ Generic-label check passed.');
  }

  // ── Stage 6: Target HTTP checks ──
  console.log('Stage 6: Target HTTP checks...');
  const httpViolations = await validateTargetHttp(matrix, exceptions);
  allViolations.push(...httpViolations);
  if (httpViolations.length > 0) {
    console.log(`  ⚠ ${httpViolations.length} HTTP target violation(s)`);
  } else {
    console.log('  ✓ Target HTTP checks passed.');
  }

  // ── Stage 7: Exception enforcement ──
  console.log('Stage 7: Exception enforcement...');
  const exceptionViolations = validateExceptions(exceptions, externalInventory);
  allViolations.push(...exceptionViolations);
  if (exceptionViolations.length > 0) {
    console.log(`  ⚠ ${exceptionViolations.length} exception enforcement violation(s)`);
  } else {
    console.log('  ✓ Exception enforcement passed.');
  }

  // ── Stage 8: Stable report emission ──
  console.log('\nStage 8: Emitting report...');
  emitReport(allViolations);

  if (allViolations.length > 0) {
    console.log(`\n  ✗ Tutorial link validation FAILED — ${allViolations.length} violation(s) must be resolved.\n`);
    process.exit(2);
  }

  console.log('\n  ✓ All tutorial link audit checks passed.\n');
  process.exit(0);
}

// Run main only when executed directly (not imported)
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isMainModule) {
  main().catch((err) => {
    console.error(`  ✗ Unexpected error: ${err.message}`);
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------
// Exports for unit testing
// ---------------------------------------------------------------------------

export {
  validateSchema,
  validateMdxFences,
  validateProcedureDuplication,
  validateExternalLinkInventory,
  validateGenericLabels,
  validateTargetHttp,
  validateExceptions,
  sortReport,
  emitReport,
  extractExternalLinks,
  countFencedBlocks,
  normalizeLabel,
  IN_SCOPE_PAGES,
  VALID_DISPOSITIONS,
  VALID_RUNNABLE_CLASSIFICATIONS,
  VALID_VERIFICATION_STATUSES,
  VALID_CENTRAL_VALUE_CATEGORIES,
  GENERIC_LABELS,
};
