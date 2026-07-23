/**
 * Semantic Review Engine — Content Scanning and Violation Detection
 *
 * Scans In_Scope_Page MDX content for:
 * - Embedded credential patterns (ALWAYS blocking, never exceptionable)
 * - Missing "Next steps" section with at least one valid Central link
 * - Missing Prototype_Boundary link for deployment/invocation/tools/samples pages
 * - Sandbox claims without matching Supported_Sandbox_Claim records
 * - Stale navigation labels, broken local links, unrecorded runnable procedures
 *
 * Requirements: 4.2, 4.3
 */

// ─── Data Models ─────────────────────────────────────────────────────────────

/**
 * A content violation detected during semantic review.
 */
export interface ContentViolation {
  /** In_Scope_Page path where violation was found */
  page: string;
  /** Category of violation */
  violationType: ViolationType;
  /** Human-readable explanation of what was detected */
  detail: string;
  /** Action needed to resolve the violation */
  remediation: string;
}

/**
 * Categories of content violations.
 */
export type ViolationType =
  | 'embedded-credential'
  | 'missing-next-steps'
  | 'missing-prototype-boundary'
  | 'unsupported-sandbox-claim'
  | 'stale-navigation-label'
  | 'broken-local-link'
  | 'unrecorded-procedure';

/**
 * A verified sandbox claim record from the Supported_Sandbox_Claim registry.
 */
export interface SupportedSandboxClaim {
  /** Claim identifier (e.g., "text-to-python-ide", "code-interpreter") */
  claimId: string;
  /** Description of what the sandbox provides */
  description: string;
  /** Canonical_Matrix target backing this claim */
  canonicalTarget: string;
}

/**
 * Options for scanning page content.
 */
export interface ScanOptions {
  /** Whether this page is classified as deployment/invocation/tools/samples */
  isPrototypeBoundaryPage?: boolean;
  /** Known valid sidebar labels for stale-label detection */
  validNavigationLabels?: string[];
  /** Known valid local link targets (relative paths) */
  validLocalLinks?: string[];
  /** Known recorded runnable procedures (block IDs) */
  recordedProcedures?: string[];
  /** Supported sandbox claim records */
  supportedSandboxClaims?: SupportedSandboxClaim[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Regex patterns for detecting embedded credentials.
 * These are NEVER exceptionable — detection is always blocking.
 */
const CREDENTIAL_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  // AWS Access Key IDs
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, name: 'AWS Access Key ID' },
  // AWS Secret Access Keys (40 character base64-ish)
  { pattern: /\b[A-Za-z0-9/+=]{40}\b(?=.*(?:secret|aws|key))/i, name: 'AWS Secret Key (contextual)' },
  // OpenAI API keys
  { pattern: /\bsk-[A-Za-z0-9]{20,}\b/, name: 'OpenAI/API secret key' },
  // Generic API key patterns
  { pattern: /\b(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_\-/.]{20,}['"]/i, name: 'Generic API key assignment' },
  // Hardcoded passwords
  { pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/i, name: 'Hardcoded password' },
  // Bearer tokens
  { pattern: /\bBearer\s+[A-Za-z0-9_\-/.]{20,}\b/, name: 'Bearer token' },
  // Private keys
  { pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/, name: 'Private key block' },
  // GitHub/GitLab tokens
  { pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/, name: 'GitHub token' },
  { pattern: /\bglpat-[A-Za-z0-9\-_]{20,}\b/, name: 'GitLab token' },
  // Generic secret/token assignments
  { pattern: /\b(?:secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-/.+=]{20,}['"]/i, name: 'Generic secret/token assignment' },
];

/**
 * Page categories that require a Prototype_Boundary link.
 * These are pages that direct deployment, invocation, tools, or samples.
 */
const PROTOTYPE_BOUNDARY_CATEGORIES = [
  'deployment',
  'deploy',
  'invocation',
  'invoke',
  'tools',
  'samples',
  'quickstart',
] as const;

/**
 * The target path for the Prototype_Boundary link.
 */
const PROTOTYPE_BOUNDARY_TARGET = 'operate/production-readiness';

/**
 * Regex to detect sandbox-related claims in content.
 */
const SANDBOX_CLAIM_PATTERN = /\b(?:sandbox|sandboxed|code\s*interpreter|text-to-python|isolated\s*execution)\b/gi;

// ─── Detector Functions ─────────────────────────────────────────────────────

/**
 * Detect embedded credential patterns in page content.
 * Credentials are NEVER exceptionable — detection is always blocking.
 *
 * @param page - The page path being scanned
 * @param content - The MDX content of the page
 * @returns Array of violations for each detected credential pattern
 */
export function detectCredentials(page: string, content: string): ContentViolation[] {
  const violations: ContentViolation[] = [];

  for (const { pattern, name } of CREDENTIAL_PATTERNS) {
    // Use a fresh regex for each scan (reset lastIndex for global patterns)
    const matches = content.match(new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g')));
    if (matches) {
      for (const match of matches) {
        // Redact the match for the detail message (show first/last chars only)
        const redacted = match.length > 8
          ? `${match.slice(0, 4)}...${match.slice(-4)}`
          : '***';
        violations.push({
          page,
          violationType: 'embedded-credential',
          detail: `Detected ${name}: "${redacted}" — credentials are never exceptionable.`,
          remediation: `Remove the embedded credential from "${page}". Use environment variables or secret references instead.`,
        });
      }
    }
  }

  return violations;
}

/**
 * Detect missing "Next steps" section in page content.
 * Each page must render a labelled Next steps section with at least one valid Central link.
 *
 * A "valid Central link" is any relative link within the documentation site
 * (not an external URL).
 *
 * @param page - The page path being scanned
 * @param content - The MDX content of the page
 * @returns Array of violations (0 or 1 item)
 */
export function detectMissingNextSteps(page: string, content: string): ContentViolation[] {
  const violations: ContentViolation[] = [];

  // Look for a "Next steps" heading (## or ### level, case-insensitive)
  const nextStepsPattern = /^#{2,3}\s+Next\s+steps?\s*$/mi;
  const hasNextStepsSection = nextStepsPattern.test(content);

  if (!hasNextStepsSection) {
    violations.push({
      page,
      violationType: 'missing-next-steps',
      detail: `Page "${page}" does not contain a labelled "Next steps" section.`,
      remediation: `Add a "## Next steps" section to "${page}" containing at least one valid Central (internal) link.`,
    });
    return violations;
  }

  // Extract content after the Next steps heading until the next heading or end of file
  const nextStepsMatch = content.match(/^#{2,3}\s+Next\s+steps?\s*\n([\s\S]*?)(?=\n#{1,3}\s|$)/mi);
  const nextStepsContent = nextStepsMatch ? nextStepsMatch[1] : '';

  // Check for at least one valid Central link (internal link, not external)
  // Internal links in MDX: [text](./path), [text](../path), [text](/path), or [text](relative-path)
  const internalLinkPattern = /\[([^\]]+)\]\((?!https?:\/\/)(?!mailto:)([^)]+)\)/;
  const hasInternalLink = internalLinkPattern.test(nextStepsContent);

  if (!hasInternalLink) {
    violations.push({
      page,
      violationType: 'missing-next-steps',
      detail: `Page "${page}" has a "Next steps" section but it contains no valid Central (internal) links.`,
      remediation: `Add at least one internal documentation link to the "Next steps" section of "${page}".`,
    });
  }

  return violations;
}

/**
 * Detect missing Prototype_Boundary link for pages that direct
 * deployment, invocation, tools, or samples.
 *
 * These pages must render a link to `operate/production-readiness`.
 *
 * @param page - The page path being scanned
 * @param content - The MDX content of the page
 * @param isPrototypeBoundaryPage - Override: explicitly mark as prototype boundary page
 * @returns Array of violations (0 or 1 item)
 */
export function detectMissingPrototypeBoundary(
  page: string,
  content: string,
  isPrototypeBoundaryPage?: boolean,
): ContentViolation[] {
  const violations: ContentViolation[] = [];

  // Determine if this page requires the Prototype_Boundary link
  const requiresLink =
    isPrototypeBoundaryPage ??
    isPrototypeBoundaryPageByPath(page) ??
    isPrototypeBoundaryPageByContent(content);

  if (!requiresLink) {
    return violations;
  }

  // Check if the page contains a link to the Prototype_Boundary target
  const boundaryLinkPattern = new RegExp(
    `\\[([^\\]]+)\\]\\([^)]*${escapeRegex(PROTOTYPE_BOUNDARY_TARGET)}[^)]*\\)`,
  );
  const hasPrototypeBoundaryLink = boundaryLinkPattern.test(content);

  if (!hasPrototypeBoundaryLink) {
    violations.push({
      page,
      violationType: 'missing-prototype-boundary',
      detail: `Page "${page}" directs deployment/invocation/tools/samples but does not link to "${PROTOTYPE_BOUNDARY_TARGET}".`,
      remediation: `Add a link to "${PROTOTYPE_BOUNDARY_TARGET}" (production readiness guide) in "${page}".`,
    });
  }

  return violations;
}

/**
 * Detect sandbox claims in content that are not backed by a
 * Supported_Sandbox_Claim record.
 *
 * @param page - The page path being scanned
 * @param content - The MDX content of the page
 * @param supportedClaims - Array of verified sandbox claim records
 * @returns Array of violations for unsupported claims
 */
export function detectUnsupportedSandboxClaims(
  page: string,
  content: string,
  supportedClaims: SupportedSandboxClaim[],
): ContentViolation[] {
  const violations: ContentViolation[] = [];

  // Build a set of supported claim identifiers for lookup
  const supportedClaimIds = new Set(supportedClaims.map((c) => c.claimId.toLowerCase()));

  // Find all sandbox-related claims in the content
  const matches = content.matchAll(SANDBOX_CLAIM_PATTERN);

  for (const match of matches) {
    const claimText = match[0].toLowerCase().replace(/\s+/g, '-');

    // Normalize the claim text to check against supported claims
    const normalizedClaim = normalizeSandboxClaim(claimText);

    if (!supportedClaimIds.has(normalizedClaim)) {
      violations.push({
        page,
        violationType: 'unsupported-sandbox-claim',
        detail: `Page "${page}" contains sandbox claim "${match[0]}" without a matching Supported_Sandbox_Claim record.`,
        remediation: `Provide a Supported_Sandbox_Claim record for "${match[0]}" or remove the claim from "${page}".`,
      });
    }
  }

  return violations;
}

/**
 * Detect stale navigation labels in page content.
 *
 * @param page - The page path being scanned
 * @param content - The MDX content of the page
 * @param validLabels - Currently valid navigation labels
 * @returns Array of violations for stale labels
 */
export function detectStaleNavigationLabels(
  page: string,
  content: string,
  validLabels: string[],
): ContentViolation[] {
  const violations: ContentViolation[] = [];

  if (validLabels.length === 0) {
    return violations;
  }

  // Look for sidebar_label in frontmatter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const labelMatch = frontmatter.match(/sidebar_label:\s*['"]?([^'"\n]+)['"]?/);
    if (labelMatch) {
      const label = labelMatch[1].trim();
      if (!validLabels.includes(label)) {
        violations.push({
          page,
          violationType: 'stale-navigation-label',
          detail: `Page "${page}" has stale sidebar_label "${label}" not in current valid labels.`,
          remediation: `Update the sidebar_label in "${page}" to a current valid label.`,
        });
      }
    }
  }

  return violations;
}

/**
 * Detect broken local links in page content.
 *
 * @param page - The page path being scanned
 * @param content - The MDX content of the page
 * @param validLocalLinks - Known valid local link targets
 * @returns Array of violations for broken links
 */
export function detectBrokenLocalLinks(
  page: string,
  content: string,
  validLocalLinks: string[],
): ContentViolation[] {
  const violations: ContentViolation[] = [];

  if (validLocalLinks.length === 0) {
    return violations;
  }

  const validLinksSet = new Set(validLocalLinks);

  // Find all local links in content (not http/https, not mailto)
  const localLinkPattern = /\[([^\]]+)\]\((?!https?:\/\/)(?!mailto:)(?!#)([^)]+)\)/g;
  const matches = content.matchAll(localLinkPattern);

  for (const match of matches) {
    const linkTarget = match[2].split('#')[0].split('?')[0]; // Strip anchors and query params
    const normalizedTarget = normalizeLocalLink(linkTarget);

    if (!validLinksSet.has(normalizedTarget) && !validLinksSet.has(linkTarget)) {
      violations.push({
        page,
        violationType: 'broken-local-link',
        detail: `Page "${page}" contains broken local link to "${linkTarget}".`,
        remediation: `Fix or remove the broken link to "${linkTarget}" in "${page}".`,
      });
    }
  }

  return violations;
}

/**
 * Detect unrecorded runnable procedures (fenced code blocks with run indicators).
 *
 * @param page - The page path being scanned
 * @param content - The MDX content of the page
 * @param recordedProcedures - IDs of recorded runnable procedures
 * @returns Array of violations for unrecorded procedures
 */
export function detectUnrecordedProcedures(
  page: string,
  content: string,
  recordedProcedures: string[],
): ContentViolation[] {
  const violations: ContentViolation[] = [];

  const recordedSet = new Set(recordedProcedures);

  // Find fenced code blocks that appear to be runnable (bash, shell, python, etc.)
  const runnableBlockPattern = /```(?:bash|shell|sh|python|py|node|javascript|js|typescript|ts)[\s\S]*?```/g;
  const matches = content.matchAll(runnableBlockPattern);

  let blockIndex = 0;
  for (const match of matches) {
    const blockContent = match[0];
    // Check if block contains executable commands (starts with $, >, or contains run/exec/install)
    const isRunnable = /(?:^\s*[$>]|\b(?:npm\s+run|npx|pip\s+install|python|node|aws)\b)/m.test(blockContent);

    if (isRunnable) {
      const blockId = `${page}:block-${blockIndex}`;
      if (!recordedSet.has(blockId)) {
        violations.push({
          page,
          violationType: 'unrecorded-procedure',
          detail: `Page "${page}" contains unrecorded runnable procedure at block index ${blockIndex}.`,
          remediation: `Audit and record the runnable procedure at block ${blockIndex} in "${page}", or remove it.`,
        });
      }
    }
    blockIndex++;
  }

  return violations;
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Scan a single page's content for all violation types.
 *
 * This is the main entry point for scanning a page. It orchestrates all
 * detector functions and returns the combined violations.
 *
 * @param page - The page path being scanned
 * @param content - The MDX content of the page
 * @param options - Scanning options (page classification, known valid data)
 * @returns Array of all violations detected in the page
 */
export function scanPageContent(
  page: string,
  content: string,
  options: ScanOptions = {},
): ContentViolation[] {
  const violations: ContentViolation[] = [];

  // 1. Credential detection (always runs, never exceptionable)
  violations.push(...detectCredentials(page, content));

  // 2. Next steps section check
  violations.push(...detectMissingNextSteps(page, content));

  // 3. Prototype boundary link check (for deployment/invocation/tools/samples pages)
  violations.push(
    ...detectMissingPrototypeBoundary(page, content, options.isPrototypeBoundaryPage),
  );

  // 4. Sandbox claim verification
  if (options.supportedSandboxClaims) {
    violations.push(
      ...detectUnsupportedSandboxClaims(page, content, options.supportedSandboxClaims),
    );
  }

  // 5. Stale navigation label detection
  if (options.validNavigationLabels) {
    violations.push(
      ...detectStaleNavigationLabels(page, content, options.validNavigationLabels),
    );
  }

  // 6. Broken local link detection
  if (options.validLocalLinks) {
    violations.push(
      ...detectBrokenLocalLinks(page, content, options.validLocalLinks),
    );
  }

  // 7. Unrecorded runnable procedure detection
  if (options.recordedProcedures !== undefined) {
    violations.push(
      ...detectUnrecordedProcedures(page, content, options.recordedProcedures),
    );
  }

  return violations;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Determine if a page requires the Prototype_Boundary link based on its path.
 */
function isPrototypeBoundaryPageByPath(page: string): boolean | null {
  const lowerPage = page.toLowerCase();
  for (const category of PROTOTYPE_BOUNDARY_CATEGORIES) {
    if (lowerPage.includes(category)) {
      return true;
    }
  }
  return null;
}

/**
 * Determine if a page requires the Prototype_Boundary link based on its content.
 * Checks for deployment/invocation/tools/samples indicators in the content.
 */
function isPrototypeBoundaryPageByContent(content: string): boolean {
  const deploymentIndicators = /\b(?:deploy(?:ment|ing)?|invoke|invocation|tools?\s+setup|sample\s+(?:code|app))/i;
  return deploymentIndicators.test(content);
}

/**
 * Normalize a sandbox claim text to a canonical form for lookup.
 */
function normalizeSandboxClaim(claimText: string): string {
  return claimText
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Normalize a local link for comparison.
 */
function normalizeLocalLink(link: string): string {
  // Remove leading ./ or ../
  let normalized = link.replace(/^\.\//, '').replace(/^\.\.\//, '');
  // Remove trailing /
  normalized = normalized.replace(/\/$/, '');
  // Remove file extensions (.mdx, .md)
  normalized = normalized.replace(/\.(?:mdx|md)$/, '');
  return normalized;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
