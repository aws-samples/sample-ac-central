/**
 * Shared fixture helpers for validate-tutorial-links tests.
 * Produces minimal valid records that can be selectively broken per test case.
 */

import { IN_SCOPE_PAGES } from '../../validate-tutorial-links.mjs';

const NOW_ISO = new Date().toISOString();

/**
 * Returns a fresh ISO timestamp guaranteed to be within 7 days.
 */
export function freshTimestamp() {
  return NOW_ISO;
}

/**
 * Returns a stale ISO timestamp more than 7 days old.
 */
export function staleTimestamp() {
  const d = new Date();
  d.setDate(d.getDate() - 10);
  return d.toISOString();
}

/**
 * Returns a future ISO date string.
 */
export function futureDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

/**
 * Returns a past ISO date string.
 */
export function pastDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}

/**
 * Creates a minimal valid matrix record for a given page.
 */
export function makeMatrixRecord(page, overrides = {}) {
  const base = {
    page,
    disposition: 'aws-doc-link-out',
    defaultTarget: {
      url: `https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/${page.replace(/\//g, '-').replace('.mdx', '')}.html`,
      expectedDomain: 'docs.aws.amazon.com',
      finalUrl: `https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/${page.replace(/\//g, '-').replace('.mdx', '')}.html`,
      httpResult: 200,
      expectedTitleOrTopic: `Topic for ${page}`,
      owner: 'test-team',
      reviewer: 'test-reviewer',
      verificationTimestamp: freshTimestamp(),
    },
    alternatives: [],
    procedureAudit: { noCanonicalProcedureRemains: true },
    centralValueCategories: ['workload fit'],
  };
  return { ...base, ...overrides };
}

/**
 * Creates a full valid canonical matrix covering all 16 In_Scope_Pages.
 */
export function makeFullMatrix(overridesByPage = {}) {
  return IN_SCOPE_PAGES.map((page) => {
    const overrides = overridesByPage[page] || {};
    return makeMatrixRecord(page, overrides);
  });
}

/**
 * Creates a minimal valid retained-code-audit record.
 */
export function makeRetainedCodeRecord(page, heading = 'Section / fence 1', overrides = {}) {
  return {
    page,
    headingAndOrdinal: heading,
    language: 'bash',
    purpose: 'Test purpose',
    runnableClassification: 'non-runnable',
    centralOnlyRationale: 'Test rationale for Central-only',
    canonicalSourceNotReplaced: 'https://docs.aws.amazon.com/example',
    reviewer: 'test-reviewer',
    approved: true,
    ...overrides,
  };
}

/**
 * Creates a minimal valid route-baseline record.
 */
export function makeRouteBaselineRecord(page, index = 0) {
  const docId = page.replace(/\//g, '-').replace('.mdx', '');
  return {
    documentId: docId,
    emittedRoute: `/docs/${page.replace('.mdx', '')}`,
    sidebarCategory: 'Tutorials',
    sidebarLabel: page,
    sidebarOrder: index,
    sourceFile: `docs/${page}`,
    captureTimestamp: NOW_ISO,
  };
}

/**
 * Creates a minimal valid external-link-inventory record.
 */
export function makeExternalLinkRecord(page, url, overrides = {}) {
  return {
    page,
    url,
    normalizedLabel: 'configure your agent',
    auditRecord: 'canonical-matrix/default',
    verificationStatus: 'verified',
    exceptionReference: null,
    ...overrides,
  };
}

/**
 * Creates a minimal valid exception record.
 */
export function makeExceptionRecord(targetOrPage, overrides = {}) {
  return {
    targetOrPage,
    owner: 'test-team',
    reason: 'Test exception reason',
    approvalReference: 'TICKET-123',
    expiryDate: futureDate(),
    publishBlocking: true,
    ...overrides,
  };
}
